// DART 공시 원본 데이터
export interface DartDisclosure {
  rcept_no: string        // 접수번호
  corp_cls: string        // 법인구분 (Y:유가증권, K:코스닥, N:코넥스, E:기타)
  corp_name: string       // 회사명
  corp_code: string       // 고유번호
  stock_code: string      // 종목코드
  report_nm: string       // 보고서명
  rcept_dt: string        // 접수일자 (YYYYMMDD)
  flr_nm: string          // 공시 제출인명
  rm: string              // 비고
}

// AI 분석 결과
export interface AnalysisResult {
  sentiment: 'positive' | 'negative' | 'neutral'
  score: number           // -100 ~ +100 (음수=악재, 양수=호재)
  summary: string         // 한 줄 요약
  key_points: string[]    // 핵심 포인트 (최대 3개)
  reasoning: string       // 판단 근거
  affected_aspects: string[] // 영향받는 측면 (실적, 재무, 사업, 지배구조 등)
}

// DB에 저장되는 공시 레코드
export interface DisclosureRecord {
  id: number
  rcept_no: string
  corp_name: string
  corp_code: string
  stock_code: string
  report_nm: string
  rcept_dt: string
  dart_url: string
  full_text: string | null
  sentiment: 'positive' | 'negative' | 'neutral' | null
  score: number | null
  summary: string | null
  key_points: string | null    // JSON string
  reasoning: string | null
  affected_aspects: string | null  // JSON string
  analyzed_at: string | null
  created_at: string
}

// 프론트엔드용 공시 데이터
export interface DisclosureView extends Omit<DisclosureRecord, 'key_points' | 'affected_aspects'> {
  key_points: string[]
  affected_aspects: string[]
}
