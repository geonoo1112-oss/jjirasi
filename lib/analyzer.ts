/**
 * AI 공시 분석 모듈 (OpenAI API 사용)
 * - 최대 3회 재시도
 * - 타임아웃 설정
 */

import OpenAI from 'openai'
import { AnalysisResult } from '@/types'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000, // 30초 타임아웃
  maxRetries: 2,  // OpenAI SDK 레벨 재시도
})

const ANALYSIS_PROMPT = `당신은 한국 주식시장 전문 애널리스트입니다.
주어진 전자공시 정보를 분석하여 해당 기업의 주가에 미치는 영향을 평가해주세요.

분석 시 고려사항:
- 단기적 주가 영향 (1~4주)과 중장기 영향을 함께 고려
- 업종 평균 대비 상대적 영향도 평가
- 시장 참여자들의 일반적인 해석 기준으로 판단
- 불확실한 경우 neutral로 평가

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": <-100 ~ +100 정수, 0이면 neutral, +100이면 극강 호재, -100이면 극강 악재>,
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
      const message = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ANALYSIS_PROMPT },
          { role: 'user', content: userMessage }
        ],
      })

      const content = message.choices[0].message.content
      if (!content) throw new Error('OpenAI 빈 응답')

      const result = JSON.parse(content.trim()) as AnalysisResult

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
        // 재시도 전 대기 (1초, 2초, ...)
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
