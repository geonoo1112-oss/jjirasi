/**
 * 단일 공시 온디맨드 AI 분석
 * - 폴러가 이미 분석한 결과(글로벌)가 있으면 캐시 반환
 * - 로그인 유저: 분석 결과를 user_analyses 테이블에 저장 (카카오 계정에만, 전체 공개 X)
 * - 비로그인: 분석 결과 반환만 하고 저장 안 함
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { neon } from '@neondatabase/serverless'
import { analyzeDisclosure } from '@/lib/analyzer'
import { fetchDisclosureDetail } from '@/lib/dart'
import { upsertUserAnalysis, getUserAnalyses } from '@/lib/db'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 없음')
  return neon(url)
}

function clean(text: string | null): string | null {
  if (!text) return text
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x00/g, '').replace(/[ ]/g, '')
}

// 콜드 스타트당 한 번만 컬럼/테이블 마이그레이션
let migrationDone = false
async function ensureSchema() {
  if (migrationDone) return
  try {
    const sql = getSql()
    await sql`ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS reasoning TEXT`
    await sql`ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS affected_aspects TEXT`
    await sql`ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS corp_cls TEXT`
    await sql`
      CREATE TABLE IF NOT EXISTS user_analyses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        rcept_no TEXT NOT NULL,
        sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral')),
        score INTEGER,
        summary TEXT,
        key_points TEXT,
        reasoning TEXT,
        affected_aspects TEXT,
        analyzed_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, rcept_no)
      )
    `
    migrationDone = true
  } catch {
    // 마이그레이션 실패해도 분석은 계속
  }
}

export async function POST(request: NextRequest) {
  try {
    // ANTHROPIC_API_KEY 미설정 시 즉시 명확한 에러 반환 (3회 타임아웃 방지)
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ success: false, error: 'AI 분석 서비스가 현재 설정되지 않았습니다. 관리자에게 문의하세요.' }, { status: 503 })
    }

    await ensureSchema()

    const body = await request.json()
    const { rcept_no, corp_name, report_nm, rcept_dt, corp_cls } = body

    if (!rcept_no || !corp_name || !report_nm) {
      return NextResponse.json({ success: false, error: '필수 파라미터 없음 (rcept_no, corp_name, report_nm)' }, { status: 400 })
    }

    // 로그인 유저 확인
    const userIdStr = cookies().get('user_id')?.value
    const userId = userIdStr ? parseInt(userIdStr) : null

    const sql = getSql()

    // 1. 로그인 유저의 기존 분석이 있으면 반환
    if (userId) {
      const userMap = await getUserAnalyses(userId, [rcept_no])
      const existing = userMap.get(rcept_no)
      if (existing && existing.summary && existing.summary !== '분석 실패') {
        return NextResponse.json({
          success: true,
          cached: true,
          analysis: {
            sentiment: existing.sentiment,
            score: existing.score,
            summary: existing.summary,
            key_points: existing.key_points ? JSON.parse(existing.key_points) : [],
            reasoning: existing.reasoning,
            affected_aspects: existing.affected_aspects ? JSON.parse(existing.affected_aspects) : [],
          },
        })
      }
    }

    // 2. 폴러가 분석한 글로벌 캐시 확인 (실패 제외)
    const globalExisting = await sql`
      SELECT sentiment, score, summary, key_points, reasoning, affected_aspects
      FROM disclosures
      WHERE rcept_no = ${rcept_no}
        AND analyzed_at IS NOT NULL
        AND summary IS NOT NULL
        AND summary != '분석 실패'
    `
    if (globalExisting.length > 0) {
      const r = globalExisting[0] as any
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

    // 3. DART 원문 가져오기
    let fullText: string | null = null
    try {
      const raw = await fetchDisclosureDetail(rcept_no)
      fullText = clean(raw)
    } catch {
      // 원문 없어도 분석 진행
    }

    // 4. AI 분석
    const analysis = await analyzeDisclosure({
      corpName: corp_name,
      reportNm: report_nm,
      rceptDt: rcept_dt,
      corpCls: corp_cls || 'Y',
      fullText,
    })

    // 5. 로그인 유저면 카카오 계정에만 저장 (전체 공개 X)
    if (userId) {
      await upsertUserAnalysis(userId, rcept_no, analysis)
    }

    return NextResponse.json({ success: true, cached: false, analysis })
  } catch (error: any) {
    const msg = error?.message || String(error)
    console.error('[DisclosureAnalyze]', msg)
    // 인증 오류 → API 키 문제
    if (msg.includes('401') || msg.includes('authentication') || msg.includes('invalid x-api-key') || msg.includes('API key')) {
      return NextResponse.json({ success: false, error: 'AI 분석 서비스 인증 오류입니다. API 키를 확인해주세요.' }, { status: 503 })
    }
    // 타임아웃
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return NextResponse.json({ success: false, error: 'AI 분석 시간이 초과되었습니다. 잠시 후 재시도해주세요.' }, { status: 504 })
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
