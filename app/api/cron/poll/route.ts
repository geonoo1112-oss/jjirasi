import { NextRequest, NextResponse } from 'next/server'
import { runPipeline, analyzeAllPending } from '@/lib/poller'
import { ensureSchema, resetFailedAnalyses } from '@/lib/db'

// Vercel Cron Job 또는 외부 스케줄러(cron-job.org) 엔드포인트
// 새 공시 수집 + pending 공시 분석 + 분석 실패 재시도
export async function GET(request: NextRequest) {
  // 시크릿 키 검증 — Authorization 헤더 또는 ?secret= 쿼리 파라미터
  const secret = process.env.CRON_SECRET
  if (secret) {
    const authHeader = request.headers.get('authorization')
    const querySecret = new URL(request.url).searchParams.get('secret')
    const provided = authHeader?.replace('Bearer ', '') || querySecret
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // 스키마 마이그레이션 (컬럼 없으면 추가)
    await ensureSchema()

    // 이전에 "분석 실패"로 저장된 레코드 → pending으로 초기화하여 재분석 대기
    const resetCount = await resetFailedAnalyses()
    if (resetCount > 0) {
      console.log(`[Cron] 분석 실패 ${resetCount}건 재시도 대기열에 추가`)
    }

    // 새 공시 수집 + 즉시 분석
    const result = await runPipeline()

    // pending 공시 배치 분석 (한 번에 5건만 - 타임아웃 방지)
    const analyzed = await analyzeAllPending()

    return NextResponse.json({ success: true, ...result, pending_analyzed: analyzed, reset: resetCount })
  } catch (error) {
    console.error('[Cron] 폴링 오류:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
