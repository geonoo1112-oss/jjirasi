import { NextResponse } from 'next/server'
import { ensureSchema } from '@/lib/db'

// 최초 배포 후 한 번만 호출 — DB 테이블 생성
export async function GET() {
  try {
    await ensureSchema()
    return NextResponse.json({ success: true, message: 'DB 스키마 생성 완료' })
  } catch (error) {
    console.error('[Setup] 스키마 생성 실패:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
