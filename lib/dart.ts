/**
 * DART(전자공시시스템) API 연동 모듈
 * API 문서: https://opendart.fss.or.kr/guide/main.do
 */

import axios from 'axios'
import { DartDisclosure } from '@/types'

const DART_API_BASE = 'https://opendart.fss.or.kr/api'

// 오늘 날짜 YYYYMMDD 형식으로 반환
function getToday(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

// N분 전 날짜/시간 (DART API는 날짜 단위 필터)
function getDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

export interface FetchOptions {
  corpCode?: string    // 특정 기업만 (비워두면 전체)
  startDate?: string  // YYYYMMDD (기본: 오늘)
  endDate?: string    // YYYYMMDD (기본: 오늘)
  page?: number
  pageCount?: number  // 한 페이지 당 건수 (max 100)
}

/**
 * 최신 공시 목록 가져오기
 */
export async function fetchDisclosures(options: FetchOptions = {}): Promise<DartDisclosure[]> {
  const apiKey = process.env.DART_API_KEY
  if (!apiKey) throw new Error('DART_API_KEY가 설정되지 않았습니다')

  const params: Record<string, string | number> = {
    crtfc_key: apiKey,
    bgn_de: options.startDate || getToday(),
    end_de: options.endDate || getToday(),
    page_no: options.page || 1,
    page_count: options.pageCount || 40,
    sort: 'date',
    sort_mth: 'desc',
  }

  // 특정 기업 코드 필터
  if (options.corpCode) {
    params.corp_code = options.corpCode
  }

  try {
    const response = await axios.get(`${DART_API_BASE}/list.json`, { params })
    const data = response.data

    if (data.status === '000') {
      return data.list as DartDisclosure[]
    } else if (data.status === '013') {
      // 해당 조건의 공시가 없음
      return []
    } else {
      console.error('DART API 오류:', data.status, data.message)
      return []
    }
  } catch (error) {
    console.error('DART API 요청 실패:', error)
    throw error
  }
}

/**
 * 공시 본문 텍스트 가져오기
 * DART 뷰어 URL에서 실제 문서를 가져오는 것은 복잡하므로,
 * 공시 제목과 메타데이터를 기반으로 AI 분석을 진행합니다.
 * (실제 첨부 문서 파싱은 XML API를 통해 가능하나 복잡도가 높음)
 */
export async function fetchDisclosureDetail(rceptNo: string): Promise<string | null> {
  const apiKey = process.env.DART_API_KEY
  if (!apiKey) return null

  try {
    // DART 원문 서류 목록 API
    const response = await axios.get(`${DART_API_BASE}/document.xml`, {
      params: {
        crtfc_key: apiKey,
        rcept_no: rceptNo,
      },
      responseType: 'text',
    })

    // XML 응답을 간단하게 텍스트 추출 (태그 제거)
    const text = response.data
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000) // 최대 3000자

    return text || null
  } catch {
    return null
  }
}

/**
 * 공시 DART 뷰어 URL 생성
 */
export function getDartUrl(rceptNo: string): string {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`
}

/**
 * 중요 공시 유형 분류 (AI 분석 우선순위 결정용)
 */
export function classifyDisclosureImportance(reportNm: string): 'high' | 'medium' | 'low' {
  const highPriority = [
    '영업(잠정)실적', '분기보고서', '반기보고서', '사업보고서',
    '주요사항보고서', '합병', '분할', '유상증자', '무상증자',
    '전환사채', '자기주식', '최대주주', '대표이사', '횡령',
    '부도', '회생', '파산', '상장폐지', '거래정지'
  ]

  const mediumPriority = [
    '공급계약', '수주', '투자', '지분', '출자', '신사업',
    '임원', '감사', '주주총회', '배당', '자산', '특허'
  ]

  for (const keyword of highPriority) {
    if (reportNm.includes(keyword)) return 'high'
  }
  for (const keyword of mediumPriority) {
    if (reportNm.includes(keyword)) return 'medium'
  }
  return 'low'
}
