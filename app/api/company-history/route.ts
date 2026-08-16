import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { fetchDisclosures, getDartUrl } from '@/lib/dart'
import axios from 'axios'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL not set')
  return neon(url)
}

function getDateRange(months: number): { bgn_de: string; end_de: string } {
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - months)
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}${m}${dd}`
  }
  return { bgn_de: fmt(start), end_de: fmt(end) }
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/**
 * DART API에서 최근 공시를 검색해 기업명으로 corp_code 찾기
 * (companies 테이블이 비어있을 때 폴백)
 */
async function discoverCorpCodeFromDart(name: string): Promise<{ corp_code: string; corp_name: string; stock_code: string } | null> {
  const apiKey = process.env.DART_API_KEY
  if (!apiKey) return null

  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - 1) // 최근 1개월 내 공시에서 검색

  try {
    // 최근 공시 최대 200건 가져와서 기업명 매칭
    const [r1, r2] = await Promise.allSettled([
      axios.get('https://opendart.fss.or.kr/api/list.json', {
        params: { crtfc_key: apiKey, bgn_de: fmtDate(start), end_de: fmtDate(end), page_no: 1, page_count: 100, sort: 'date', sort_mth: 'desc' },
      }),
      axios.get('https://opendart.fss.or.kr/api/list.json', {
        params: { crtfc_key: apiKey, bgn_de: fmtDate(start), end_de: fmtDate(end), page_no: 2, page_count: 100, sort: 'date', sort_mth: 'desc' },
      }),
    ])

    const list: any[] = [
      ...(r1.status === 'fulfilled' && r1.value.data.status === '000' ? r1.value.data.list : []),
      ...(r2.status === 'fulfilled' && r2.value.data.status === '000' ? r2.value.data.list : []),
    ]

    // 정확한 이름 매칭 우선, 없으면 부분 매칭
    const exact = list.find((d: any) => d.corp_name === name)
    const partial = list.find((d: any) => d.corp_name?.includes(name) || name.includes(d.corp_name))
    const match = exact || partial

    if (match) {
      return { corp_code: match.corp_code, corp_name: match.corp_name, stock_code: match.stock_code || '' }
    }
  } catch {
    // 무시
  }

  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name') || ''
  const corpCodeParam = searchParams.get('corp_code') || ''
  const months = Math.min(parseInt(searchParams.get('months') || '3'), 24)

  try {
    const sql = getSql()
    let corpCode = corpCodeParam
    let companyName = name
    let stockCode = ''
    let market = ''

    // 1. companies 테이블에서 기업 찾기
    if (!corpCode && name) {
      const pattern = `%${name}%`
      const rows = await sql`
        SELECT corp_code, corp_name, stock_code, market
        FROM companies
        WHERE corp_name ILIKE ${pattern} OR stock_code ILIKE ${pattern}
        ORDER BY market_cap DESC NULLS LAST
        LIMIT 1
      `
      if (rows.length > 0) {
        corpCode = rows[0].corp_code as string
        companyName = rows[0].corp_name as string
        stockCode = rows[0].stock_code as string
        market = rows[0].market as string
      }
    }

    // 2. companies 테이블에 없으면 disclosures 테이블에서 찾기
    if (!corpCode && name) {
      const pattern = `%${name}%`
      const rows = await sql`
        SELECT corp_code, corp_name, stock_code FROM disclosures
        WHERE corp_name ILIKE ${pattern}
        ORDER BY rcept_dt DESC
        LIMIT 1
      `
      if (rows.length > 0) {
        corpCode = rows[0].corp_code as string
        companyName = rows[0].corp_name as string
        stockCode = rows[0].stock_code as string
      }
    }

    // 3. 두 테이블 모두 없으면 DART API 최근 공시에서 corp_code 자동 탐색
    if (!corpCode && name) {
      const found = await discoverCorpCodeFromDart(name)
      if (found) {
        corpCode = found.corp_code
        companyName = found.corp_name
        stockCode = found.stock_code
      }
    }

    if (!corpCode) {
      return NextResponse.json({
        error: `"${name}" 기업을 찾을 수 없습니다. 최근 1개월 내 DART 공시가 없거나 기업명을 확인해주세요.`
      }, { status: 404 })
    }

    // 3. DART API에서 해당 기업의 공시 목록 가져오기
    const { bgn_de, end_de } = getDateRange(months)

    // 기업별 조회는 page 1만 (최대 100건) - 다중 페이지 시 DART가 동일 데이터를 반복 반환하는 버그 방지
    const page1Result = await fetchDisclosures({ corpCode, startDate: bgn_de, endDate: end_de, page: 1, pageCount: 100 })

    // rcept_no 기준 중복 제거 (DART API 응답 중복 방어)
    const seenRceptNo = new Set<string>()
    const dartDisclosures = page1Result.filter(d => {
      if (seenRceptNo.has(d.rcept_no)) return false
      seenRceptNo.add(d.rcept_no)
      return true
    })

    // 4. 로컬 DB의 분석 결과 가져오기
    const localRows = await sql`
      SELECT rcept_no, sentiment, score, summary, key_points, analyzed_at
      FROM disclosures
      WHERE corp_code = ${corpCode}
      ORDER BY rcept_dt DESC
    `
    const localMap = new Map(localRows.map((r: any) => [r.rcept_no as string, r]))

    // 5. DART 공시 목록 + 로컬 분석 결과 병합
    const merged = dartDisclosures.map(d => {
      const local = localMap.get(d.rcept_no) as any
      return {
        rcept_no: d.rcept_no,
        corp_name: d.corp_name || companyName,
        corp_code: d.corp_code || corpCode,
        stock_code: d.stock_code || stockCode,
        report_nm: d.report_nm,
        rcept_dt: d.rcept_dt,
        flr_nm: d.flr_nm,
        dart_url: getDartUrl(d.rcept_no),
        sentiment: local?.sentiment || null,
        score: local?.score ?? null,
        summary: local?.summary || null,
        key_points: local?.key_points ? JSON.parse(local.key_points) : [],
        analyzed: !!local?.analyzed_at,
      }
    })

    // 날짜 내림차순 정렬
    merged.sort((a, b) => b.rcept_dt.localeCompare(a.rcept_dt))

    return NextResponse.json({
      company: { corp_code: corpCode, corp_name: companyName, stock_code: stockCode, market },
      disclosures: merged,
      total: merged.length,
      date_range: { from: bgn_de, to: end_de, months },
    })
  } catch (error) {
    console.error('[Company History] 오류:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
