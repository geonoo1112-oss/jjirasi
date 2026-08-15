import { NextResponse } from 'next/server'
import { getKakaoAuthUrl } from '@/lib/kakao'

// 카카오 로그인 시작 → 카카오 인증 페이지로 리다이렉트
export async function GET() {
  const url = getKakaoAuthUrl()
  return NextResponse.redirect(url)
}
