/**
 * 분석 실패한 공시 초기화 → 폴러가 재분석
 */
import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

export async function POST() {
  const url = process.env.DATABASE_URL
  if (!url) return NextResponse.json({ error: 'DATABASE_URL 없음' }, { status: 500 })

  try {
    const sql = neon(url)

    // 분석 실패한 공시의 analyzed_at 초기화 → 재분석 대기 상태로
    const result = await sql`
      UPDATE disclosures
      SET
        analyzed_at = NULL,
        sentiment = NULL,
        score = NULL,
        summary = NULL,
        key_points = NULL,
        reasoning = NULL,
        affected_aspects = NULL
      WHERE summary = '분석 실패'
      RETURNING rcept_no, corp_name, report_nm
    `

    return NextResponse.json({
      success: true,
      reset: result.length,
      message: `${result.length}개 공시 초기화 완료 — 다음 폴링 시 재분석됩니다`,
      items: result,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
