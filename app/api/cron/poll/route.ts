import { NextResponse } from 'next/server'
import { runPipeline, analyzeAllPending } from '@/lib/poller'

// Vercel Cron Job 엔드포인트
// 새 공시 수집 + pending 공시 일괄 분석 (크론에서만 실행)
export async function GET() {
  try {
    const result = await runPipeline()
    await analyzeAllPending() // 크론에서만 미분석 공시 일괄 처리
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[Cron] 폴링 오류:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
