import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { updateUserSettings, getUserById } from '@/lib/db'

function getUserId(): number | null {
  const id = cookies().get('user_id')?.value
  return id ? parseInt(id) : null
}

export async function GET() {
  const userId = getUserId()
  if (!userId) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const user = getUserById(userId)
  return NextResponse.json({ user })
}

export async function PATCH(request: NextRequest) {
  const userId = getUserId()
  if (!userId) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const body = await request.json()
  updateUserSettings(userId, {
    notify_positive: body.notify_positive,
    notify_negative: body.notify_negative,
    notify_neutral: body.notify_neutral,
    min_score: body.min_score,
    min_market_cap: body.min_market_cap,
  })

  return NextResponse.json({ success: true })
}
