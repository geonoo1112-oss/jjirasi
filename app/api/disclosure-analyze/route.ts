/**
 * 단일 공시 온디맨드 AI 분석
 * - DB에 이미 분석된 결과가 있으면 캐시 반환 (폴러가 분석한 결과만)
 * - 없으면 AI 분석 후 결과 반환만 함 (DB 저장 안 함 → 다른 유저에게 노출 방지)
 */
import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { analyzeDisclosure } from '@/lib/analyzer'
import { fetchDisclosureDetail } from '@/lib/dart'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 없음')
  return neon(url)
}

// PostgreSQL은 null 바이트(0x00) 허용 안 함 → 제거
function clean(text: string | null): string | null {
  if (!text) return text
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x00/g, '').replace(/[ ]/g, '')
}

// 콜드 스타트당 한 번만 컬럼 마이그레이션 실행
let migrationDone = false
async function ensureColumns() {
  if (migrationDone) return
  try {
    const sql = getSql()
    await sql`ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS reasoning TEXT`
    await sql`ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS affected_aspects TEXT`
    await sql`ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS corp_cls TEXT`
    migrationDone = true
  } catch {
    // 마이그레이션 실패해도 분석은 계속 시도
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureColumns()

    const body = await request.json()
    const { rcept_no, corp_name, report_nm, rcept_dt, corp_cls } = body

    if (!rcept_no || !corp_name || !report_nm) {
      return NextResponse.json({ error: '필수 파라미터 없음 (rcept_no, corp_name, report_nm)' }, { status: 400 })
    }

    const sql = getSql()

    // 1. 폴러가 이미 분석한 결과가 있으면 캐시 반환 (실패 결과는 재분석)
    const existing = await sql`
      SELECT sentiment, score, summary, key_points, reasoning, affected_aspects
      FROM disclosures
      WHERE rcept_no = ${rcept_no}
        AND analyzed_at IS NOT NULL
        AND summary IS NOT NULL
        AND summary != '분석 실패'
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

    // 2. DART 원문 텍스트 가져오기 (가능하면)
    let fullText: string | null = null
    try {
      const raw = await fetchDisclosureDetail(rcept_no)
      fullText = clean(raw)
    } catch {
      // 원문 없어도 분석 진행
    }

    // 3. AI 분석 (결과는 DB에 저장하지 않음 → 요청한 유저에게만 반환)
    const analysis = await analyzeDisclosure({
      corpName: corp_name,
      reportNm: report_nm,
      rceptDt: rcept_dt,
      corpCls: corp_cls || 'Y',
      fullText,
    })

    return NextResponse.json({ success: true, cached: false, analysis })
  } catch (error) {
    console.error('[DisclosureAnalyze]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
