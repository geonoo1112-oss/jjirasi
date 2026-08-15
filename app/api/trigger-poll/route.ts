import { NextResponse } from 'next/server'
import { runPipeline } from '@/lib/poller'

// 수동으로 폴링 트리거 (버튼 클릭 시)
export async function POST() {
  try {
    const result = await runPipeline()
    return NextResponse.json({
      success: true,
      message: `새 공시 ${result.fetched}건 수집, ${result.analyzed}건 분석 완료`,
      ...result,
    })
  } catch (error) {
    console.error('수동 폴링 오류:', error)
    return NextResponse.json({ error: '폴링 실패', detail: String(error) }, { status: 500 })
  }
}
