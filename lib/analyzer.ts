/**
 * AI 공시 분석 모듈 (OpenAI API 사용)
 * 공시 내용을 받아서 호재/악재/중립 판단 및 상세 분석 제공
 */

import OpenAI from 'openai'
import { AnalysisResult } from '@/types'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
  "affected_aspects": ["<영향 받는 측면>"] // 실적, 재무구조, 사업확장, 지배구조, 투자심리 중 해당 항목
}`

interface DisclosureInput {
  corpName: string
  reportNm: string
  rceptDt: string
  corpCls: string   // Y:유가증권, K:코스닥
  fullText?: string | null
}

/**
 * 공시 하나를 AI로 분석
 */
export async function analyzeDisclosure(disclosure: DisclosureInput): Promise<AnalysisResult> {
  const corpType = disclosure.corpCls === 'Y' ? '유가증권시장(코스피)'
                 : disclosure.corpCls === 'K' ? '코스닥'
                 : '기타'

  const userMessage = `
기업명: ${disclosure.corpName}
시장: ${corpType}
공시 제목: ${disclosure.reportNm}
공시 날짜: ${disclosure.rceptDt}
${disclosure.fullText ? `\n공시 본문 (일부):\n${disclosure.fullText}` : ''}
`.trim()

  try {
    const message = await client.chat.completions.create({
      model: 'gpt-4o-mini',  // 저렴하고 빠름. 더 정확하게 하려면 'gpt-4o'로 변경
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ANALYSIS_PROMPT },
        { role: 'user', content: userMessage }
      ],
    })

    const content = message.choices[0].message.content
    if (!content) throw new Error('빈 응답')

    // JSON 파싱
    const jsonText = content.trim()
    const result = JSON.parse(jsonText) as AnalysisResult

    // 유효성 검사
    if (!['positive', 'negative', 'neutral'].includes(result.sentiment)) {
      throw new Error('유효하지 않은 sentiment 값')
    }

    return {
      sentiment: result.sentiment,
      score: Math.max(-100, Math.min(100, result.score)),
      summary: result.summary || '분석 완료',
      key_points: Array.isArray(result.key_points) ? result.key_points.slice(0, 3) : [],
      reasoning: result.reasoning || '',
      affected_aspects: Array.isArray(result.affected_aspects) ? result.affected_aspects : [],
    }

  } catch (error) {
    console.error('AI 분석 실패:', error)

    // 폴백: 기본값 반환
    return {
      sentiment: 'neutral',
      score: 0,
      summary: '분석 실패',
      key_points: ['AI 분석 중 오류가 발생했습니다'],
      reasoning: String(error),
      affected_aspects: [],
    }
  }
}

/**
 * 여러 공시를 배치로 분석 (API 레이트 리밋 고려)
 */
export async function analyzeBatch(
  disclosures: DisclosureInput[],
  delayMs = 500
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = []

  for (const disclosure of disclosures) {
    const result = await analyzeDisclosure(disclosure)
    results.push(result)

    // API 레이트 리밋 방지를 위한 딜레이
    if (disclosures.indexOf(disclosure) < disclosures.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return results
}
