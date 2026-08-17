/**
 * 내 분석 기록 API
 * 로그인 유저의 user_analyses 레코드를 반환
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { neon } from '@neondatabase/serverless'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 없음')
  return neon(url)
}

export async function GET(request: NextRequest) {
  try {
    const userIdStr = cookies().get('user_id')?.value
    if (!userIdStr) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다' }, { status: 401 })
    }
    const userId = parseInt(userIdStr)

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const sql = getSql()

    // user_analyses LEFT JOIN disclosures (폴러가 수집한 경우 corp 정보 보완)
    const rows = await sql`
      SELECT
        ua.id,
        ua.rcept_no,
        ua.sentiment,
        ua.score,
        ua.summary,
        ua.key_points,
        ua.reasoning,
        ua.affected_aspects,
        ua.analyzed_at,
        COALESCE(ua.corp_name, d.corp_name) AS corp_name,
        COALESCE(ua.report_nm, d.report_nm) AS report_nm,
        COALESCE(ua.rcept_dt, d.rcept_dt)   AS rcept_dt,
        COALESCE(ua.dart_url, d.dart_url)   AS dart_url,
        d.stock_code,
        d.corp_code,
        d.corp_cls
      FROM user_analyses ua
      LEFT JOIN disclosures d ON ua.rcept_no = d.rcept_no
      WHERE ua.user_id = ${userId}
      ORDER BY ua.analyzed_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const total = await sql`SELECT COUNT(*)::int AS c FROM user_analyses WHERE user_id = ${userId}`

    const analyses = (rows as any[]).map(r => ({
      id: r.id,
      rcept_no: r.rcept_no,
      corp_name: r.corp_name || '(기업명 없음)',
      report_nm: r.report_nm || '',
      rcept_dt: r.rcept_dt || '',
      dart_url: r.dart_url || `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcept_no}`,
      stock_code: r.stock_code || null,
      corp_code: r.corp_code || null,
      sentiment: r.sentiment,
      score: r.score,
      summary: r.summary,
      key_points: r.key_points ? JSON.parse(r.key_points) : [],
      reasoning: r.reasoning || '',
      affected_aspects: r.affected_aspects ? JSON.parse(r.affected_aspects) : [],
      analyzed_at: r.analyzed_at,
    }))

    return NextResponse.json({ success: true, analyses, total: total[0].c })
  } catch (error: any) {
    console.error('[MyAnalyses]', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
