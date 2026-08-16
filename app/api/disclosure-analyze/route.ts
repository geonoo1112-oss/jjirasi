/**
 * 단일 공시 온디맨드 AI 분석
 * - DART에서 가져온 공시를 DB에 저장한 뒤 AI로 분석
 * - 이미 분석된 공시면 기존 결과 반환
 */
import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { analyzeDisclosure } from '@/lib/analyzer'
import { fetchDisclosureDetail, getDartUrl } from '@/lib/dart'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 없음')
  return neon(url)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { rcept_no, corp_name, corp_code, stock_code, report_nm, rcept_dt, corp_cls } = body

    if (!rcept_no || !corp_name || !report_nm) {
      return NextResponse.json({ error: '필수 파라미터 없음 (rcept_no, corp_name, report_nm)' }, { status: 400 })
    }

    const sql = getSql()
    const dart_url = getDartUrl(rcept_no)

    // 1. 이미 분석된 결과가 있으면 바로 반환
    const existing = await sql`
      SELECT sentiment, score, summary, key_points, reasoning, affected_aspects, analyzed_at
      FROM disclosures
      WHERE rcept_no = ${rcept_no} AND analyzed_at IS NOT NULL
    `
    if (existing.length > 0) {
      const r = existing[0] as any
      return NextResponse.json({
        success: true,
        cached: true,
        analysis: {
          sentiment: r.sentiment,
          score: r.score,
          summary: r.summary,
          key_points: r.key_points ? JSON.parse(r.key_points) : [],
          reasoning: r.reasoning,
          affected_aspects: r.affected_aspects ? JSON.parse(r.affected_aspects) : [],
        },
      })
    }

    // 2. DB에 공시 저장 (없으면 새로 추가)
    await sql`
      INSERT INTO disclosures (rcept_no, corp_name, corp_code, stock_code, report_nm, rcept_dt, corp_cls, dart_url)
      VALUES (
        ${rcept_no}, ${corp_name}, ${corp_code || ''}, ${stock_code || ''},
        ${report_nm}, ${rcept_dt}, ${corp_cls || 'Y'}, ${dart_url}
      )
      ON CONFLICT (rcept_no) DO NOTHING
    `

    // 3. DART 원문 텍스트 가져오기 (가능하면)
    let fullText: string | null = null
    try {
      fullText = await fetchDisclosureDetail(rcept_no)
    } catch {
      // 원문 없어도 분석 진행
    }

    // 4. AI 분석 (원문 텍스트 있으면 함께 사용)
    const analysis = await analyzeDisclosure({
      corpName: corp_name,
      reportNm: report_nm,
      rceptDt: rcept_dt,
      corpCls: corp_cls || 'Y',
      fullText,
    })

    // 5. 분석 결과 저장
    await sql`
      UPDATE disclosures SET
        full_text = ${fullText},
        sentiment = ${analysis.sentiment},
        score = ${analysis.score},
        summary = ${analysis.summary},
        key_points = ${JSON.stringify(analysis.key_points)},
        reasoning = ${analysis.reasoning},
        affected_aspects = ${JSON.stringify(analysis.affected_aspects)},
        analyzed_at = NOW()
      WHERE rcept_no = ${rcept_no}
    `

    return NextResponse.json({ success: true, cached: false, analysis })
  } catch (error) {
    console.error('[DisclosureAnalyze]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
