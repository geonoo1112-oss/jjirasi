import { NextResponse } from 'next/server'
import { runPipeline } from '@/lib/poller'

// Vercel Cron Job 엔드포인트
export async function GET() {
  try {
    const result = await runPipeline()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[Cron] 폴링 오류:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
