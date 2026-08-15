import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { subscribe, unsubscribe, getUserSubscriptions, getUserById } from '@/lib/db'

function getUserId(): number | null {
  const cookieStore = cookies()
  const id = cookieStore.get('user_id')?.value
  return id ? parseInt(id) : null
}

// 내 구독 목록 조회
export async function GET() {
  const userId = getUserId()
  if (!userId) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const subscriptions = getUserSubscriptions(userId)
  const user = getUserById(userId)
  return NextResponse.json({ subscriptions, user })
}

// 기업 구독 추가
export async function POST(request: NextRequest) {
  const userId = getUserId()
  if (!userId) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { corp_code } = await request.json()
  if (!corp_code) return NextResponse.json({ error: 'corp_code 필요' }, { status: 400 })

  subscribe(userId, corp_code)
  return NextResponse.json({ success: true })
}

// 기업 구독 취소
export async function DELETE(request: NextRequest) {
  const userId = getUserId()
  if (!userId) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { corp_code } = await request.json()
  if (!corp_code) return NextResponse.json({ error: 'corp_code 필요' }, { status: 400 })

  unsubscribe(userId, corp_code)
  return NextResponse.json({ success: true })
}
