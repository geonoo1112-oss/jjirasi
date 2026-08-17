/**
 * AI 공시 분석 모듈 (Anthropic Claude API 사용)
 * - 최대 3회 재시도
 * - 타임아웃 설정
 */

import Anthropic from '@anthropic-ai/sdk'
import { AnalysisResult } from '@/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30000, // 30초 타임아웃
  maxRetries: 2,  // SDK 레벨 재시도
})

const ANALYSIS_PROMPT = `당신은 한국 주식시장 전문 애널리스트입니다.
주어진 전자공시 정보를 분석하여 해당 기업의 주가에 미치는 영향을 평가해주세요.

분석 시 고려사항:
- 단기적 주가 영향 (1~4주)과 중장기 영향을 함께 고려
- 업종 평균 대비 상대적 영향도 평가
- 시장 참여자들의 일반적인 해석 기준으로 판단
- 불확실한 경우 neutral로 평가

점수(score) 부여 기준 — 반드시 아래 구간을 기준으로 일관되게 판단하세요:
  호재(positive):
    +1  ~ +30  : 약한 호재 (단기 소폭 상승 기대, 불확실성 있음)
    +31 ~ +60  : 중간 호재 (실적 개선, 수주, 계약 등 명확한 긍정 요인)
    +61 ~ +100 : 강한 호재 (대형 계약, 흑자전환, 합병 시너지 등 시장에 즉각 반응 예상)
  중립(neutral):
    0          : 영향 없음 또는 상쇄됨
  악재(negative):
    -1  ~ -30  : 약한 악재 (단기 소폭 하락 우려, 불확실성 있음)
    -31 ~ -60  : 중간 악재 (실적 부진, 소송, 지분 희석 등 명확한 부정 요인)
    -61 ~ -100 : 강한 악재 (부도, 횡령, 상장폐지 위험, 대규모 손실 등 즉각 급락 예상)

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": <위 기준에 따른 정수>,
  "summary": "<15자 이내 한 줄 요약>",
  "key_points": ["<핵심 포인트 1>", "<핵심 포인트 2>", "<핵심 포인트 3>"],
  "reasoning": "<판단 근거 2~3문장>",
  "affected_aspects": ["<영향 받는 측면>"]
}`

interface DisclosureInput {
  corpName: string
  reportNm: string
  rceptDt: string
  corpCls: string
  fullText?: string | null
}

/**
 * 공시 하나를 AI로 분석 (최대 3회 재시도, 실패 시 throw)
 */
export async function analyzeDisclosure(disclosure: DisclosureInput): Promise<AnalysisResult> {
  const corpType = disclosure.corpCls === 'Y' ? '유가증권시장(코스피)'
                 : disclosure.corpCls === 'K' ? '코스닥'
                 : '기타'

  const userMessage = `기업명: ${disclosure.corpName}
시장: ${corpType}
공시 제목: ${disclosure.reportNm}
공시 날짜: ${disclosure.rceptDt}
${disclosure.fullText ? `\n공시 본문 (일부):\n${disclosure.fullText.slice(0, 2000)}` : ''}`.trim()

  const MAX_RETRIES = 3
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: ANALYSIS_PROMPT,
        messages: [
          { role: 'user', content: userMessage }
        ],
      })

      const content = message.content[0]
      if (!content || content.type !== 'text') throw new Error('Claude 빈 응답')

      // JSON 블록 추출 (마크다운 코드블록 제거)
      const raw = content.text.trim()
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('JSON을 찾을 수 없음')

      const result = JSON.parse(jsonMatch[0]) as AnalysisResult

      if (!['positive', 'negative', 'neutral'].includes(result.sentiment)) {
        throw new Error(`유효하지 않은 sentiment: ${result.sentiment}`)
      }

      return {
        sentiment: result.sentiment,
        score: Math.max(-100, Math.min(100, result.score ?? 0)),
        summary: result.summary || '분석 완료',
        key_points: Array.isArray(result.key_points) ? result.key_points.slice(0, 3) : [],
        reasoning: result.reasoning || '',
        affected_aspects: Array.isArray(result.affected_aspects) ? result.affected_aspects : [],
      }

    } catch (error) {
      lastError = error
      console.error(`[Analyzer] ${disclosure.corpName} - ${disclosure.reportNm} 시도 ${attempt}/${MAX_RETRIES} 실패:`, error)

      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * attempt))
      }
    }
  }

  // 3회 모두 실패 → throw (호출자가 처리)
  throw lastError
}

export async function analyzeBatch(
  disclosures: DisclosureInput[],
  delayMs = 500
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = []

  for (const disclosure of disclosures) {
    const result = await analyzeDisclosure(disclosure)
    results.push(result)

    if (disclosures.indexOf(disclosure) < disclosures.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return results
}
