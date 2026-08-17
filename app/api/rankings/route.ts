/**
 * 분석 인기 기업 랭킹 API
 * disclosures 기준으로 기간별 가장 많이 공시된 기업 TOP 10
 */
import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 없음')
  return neon(url)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'today'

    // rcept_dt는 YYYYMMDD 형식의 문자열
    // 오늘 하루: 당일 날짜와 같은 것만
    // 일주일: 오늘 포함 7일
    // 한달: 오늘 포함 30일
    const daysBack = period === 'month' ? 29 : period === 'week' ? 6 : 0

    const sql = getSql()

    const rows = await sql`
      SELECT
        corp_name,
        MAX(stock_code) AS stock_code,
        COUNT(*)::int   AS total,
        COUNT(CASE WHEN sentiment = 'positive' THEN 1 END)::int AS positive_count,
        COUNT(CASE WHEN sentiment = 'negative' THEN 1 END)::int AS negative_count,
        COUNT(CASE WHEN sentiment = 'neutral'  THEN 1 END)::int AS neutral_count
      FROM disclosures
      WHERE corp_name IS NOT NULL
        AND rcept_dt >= TO_CHAR(CURRENT_DATE - (${daysBack} * INTERVAL '1 day'), 'YYYYMMDD')
      GROUP BY corp_name
      ORDER BY total DESC
      LIMIT 10
    `

    const rankings = (rows as any[]).map((r, i) => {
      const dominant =
        r.positive_count >= r.negative_count && r.positive_count >= r.neutral_count ? 'positive'
        : r.negative_count >= r.positive_count && r.negative_count >= r.neutral_count ? 'negative'
        : 'neutral'
      return {
        rank: i + 1,
        corp_name: r.corp_name,
        stock_code: r.stock_code || null,
        total: r.total,
        positive_count: r.positive_count,
        negative_count: r.negative_count,
        neutral_count: r.neutral_count,
        dominant,
      }
    })

    return NextResponse.json({ success: true, rankings, period })
  } catch (error: any) {
    console.error('[Rankings]', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
