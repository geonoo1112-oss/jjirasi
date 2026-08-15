import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getKakaoToken, getKakaoUserInfo } from '@/lib/kakao'
import { upsertUser } from '@/lib/db'

// 카카오 OAuth 콜백 처리
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/?error=kakao_login_failed', request.url))
  }

  try {
    // 인가 코드 → 액세스 토큰
    const tokenData = await getKakaoToken(code)

    // 사용자 정보 조회
    const userInfo = await getKakaoUserInfo(tokenData.access_token)

    // DB에 저장 / 업데이트
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    const userId = upsertUser({
      kakao_id: userInfo.id,
      nickname: userInfo.nickname,
      email: userInfo.email,
      kakao_access_token: tokenData.access_token,
      kakao_refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
    })

    // 세션 쿠키 설정 (간단한 세션 관리)
    const cookieStore = cookies()
    cookieStore.set('user_id', String(userId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30일
    })

    return NextResponse.redirect(new URL('/settings?login=success', request.url))

  } catch (error) {
    console.error('[Auth] 카카오 로그인 실패:', error)
    return NextResponse.redirect(new URL('/?error=login_failed', request.url))
  }
}
