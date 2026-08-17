/**
 * 분석 인기 기업 랭킹 API
 * user_analyses 기준으로 기간별 가장 많이 분석 요청된 기업 TOP 10
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
    const days = period === 'month' ? 30 : period === 'week' ? 7 : 1

    const sql = getSql()

    const rows = await sql`
      SELECT
        COALESCE(ua.corp_name, d.corp_name) AS corp_name,
        MAX(d.stock_code)                    AS stock_code,
        COUNT(*)::int                        AS total,
        COUNT(CASE WHEN ua.sentiment = 'positive' THEN 1 END)::int AS positive_count,
        COUNT(CASE WHEN ua.sentiment = 'negative' THEN 1 END)::int AS negative_count,
        COUNT(CASE WHEN ua.sentiment = 'neutral'  THEN 1 END)::int AS neutral_count
      FROM user_analyses ua
      LEFT JOIN disclosures d ON ua.rcept_no = d.rcept_no
      WHERE ua.analyzed_at >= NOW() - (${days} * INTERVAL '1 day')
        AND COALESCE(ua.corp_name, d.corp_name) IS NOT NULL
      GROUP BY COALESCE(ua.corp_name, d.corp_name)
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
