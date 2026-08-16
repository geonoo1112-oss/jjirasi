import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { fetchDisclosures, getDartUrl } from '@/lib/dart'

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

    if (!corpCode) {
      return NextResponse.json({ error: '회사를 찾을 수 없습니다. 먼저 기업 데이터를 가져오세요.' }, { status: 404 })
    }

    // 3. DART API에서 해당 기업의 공시 목록 가져오기
    const { bgn_de, end_de } = getDateRange(months)

    const [page1, page2, page3] = await Promise.allSettled([
      fetchDisclosures({ corpCode, startDate: bgn_de, endDate: end_de, page: 1, pageCount: 100 }),
      fetchDisclosures({ corpCode, startDate: bgn_de, endDate: end_de, page: 2, pageCount: 100 }),
      fetchDisclosures({ corpCode, startDate: bgn_de, endDate: end_de, page: 3, pageCount: 100 }),
    ])

    const dartDisclosures = [
      ...(page1.status === 'fulfilled' ? page1.value : []),
      ...(page2.status === 'fulfilled' ? page2.value : []),
      ...(page3.status === 'fulfilled' ? page3.value : []),
    ]

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
