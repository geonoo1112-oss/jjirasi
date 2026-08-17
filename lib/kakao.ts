/**
 * 카카오톡 알림 서비스
 * - 카카오 OAuth로 로그인
 * - 분석 완료 시 구독 유저에게 카카오톡 메시지 전송
 */

import axios from 'axios'
import { getUsersToNotify, recordNotification, upsertUser } from './db'
import { DisclosureRecord } from '@/types'

const KAKAO_API_BASE = 'https://kapi.kakao.com'
const KAKAO_AUTH_BASE = 'https://kauth.kakao.com'

// ─── OAuth ───────────────────────────────────────────────

/**
 * 카카오 로그인 URL 생성
 */
export function getKakaoAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.KAKAO_CLIENT_ID!,
    redirect_uri: process.env.KAKAO_REDIRECT_URI!,
    response_type: 'code',
    scope: 'profile_nickname,talk_message',  // 카카오톡 메시지 전송 권한
    ...(state ? { state } : {}),
  })
  return `${KAKAO_AUTH_BASE}/oauth/authorize?${params}`
}

/**
 * 인가 코드 → 액세스 토큰 교환
 */
export async function getKakaoToken(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const res = await axios.post(
    `${KAKAO_AUTH_BASE}/oauth/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.KAKAO_CLIENT_ID!,
      client_secret: process.env.KAKAO_CLIENT_SECRET || '',
      redirect_uri: process.env.KAKAO_REDIRECT_URI!,
      code,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  return res.data
}

/**
 * 액세스 토큰으로 카카오 사용자 정보 조회
 */
export async function getKakaoUserInfo(accessToken: string): Promise<{
  id: string
  nickname: string
  email?: string
}> {
  const res = await axios.get(`${KAKAO_API_BASE}/v2/user/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return {
    id: String(res.data.id),
    nickname: res.data.kakao_account?.profile?.nickname || '사용자',
    email: res.data.kakao_account?.email,
  }
}

/**
 * 리프레시 토큰으로 액세스 토큰 갱신
 */
export async function refreshKakaoToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await axios.post(
      `${KAKAO_AUTH_BASE}/oauth/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.KAKAO_CLIENT_ID!,
        client_secret: process.env.KAKAO_CLIENT_SECRET || '',
        refresh_token: refreshToken,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
    return res.data.access_token
  } catch {
    return null
  }
}

// ─── 메시지 전송 ──────────────────────────────────────────

const SENTIMENT_EMOJI = {
  positive: '🟢',
  negative: '🔴',
  neutral: '⚪',
}

const SENTIMENT_LABEL = {
  positive: '호재',
  negative: '악재',
  neutral: '중립',
}

// 점수와 감성으로 강도 레이블 반환
function getStrengthLabel(score: number, sentiment: 'positive' | 'negative' | 'neutral'): string {
  const abs = Math.abs(score)
  const strength = abs <= 30 ? '약한' : abs <= 60 ? '중간' : '강한'
  const direction = sentiment === 'positive' ? '호재' : sentiment === 'negative' ? '악재' : '중립'
  return `${strength} ${direction}`
}

/**
 * 단일 유저에게 카카오톡 메시지 전송
 * "나에게 보내기" API 사용 (별도 채널 필요 없음)
 * 중간/강한 호재만 전송 — 세부 내용은 사이트에서 확인
 */
export async function sendKakaoMessage(
  accessToken: string,
  disclosure: {
    corp_name: string
    report_nm: string
    sentiment: 'positive' | 'negative' | 'neutral'
    score: number
    dart_url: string
    rcept_dt: string
  }
): Promise<boolean> {
  const strengthLabel = getStrengthLabel(disclosure.score, disclosure.sentiment)
  const emoji = disclosure.sentiment === 'positive' ? '📈' : disclosure.sentiment === 'negative' ? '📉' : '➖'
  const dateStr = `${disclosure.rcept_dt.slice(0, 4)}.${disclosure.rcept_dt.slice(4, 6)}.${disclosure.rcept_dt.slice(6, 8)}`
  const deepLink = `https://jjirasi.co.kr/?company=${encodeURIComponent(disclosure.corp_name)}`

  const message = {
    object_type: 'feed',
    content: {
      title: `[${strengthLabel}] ${disclosure.corp_name}`,
      description: `${disclosure.report_nm}\n\njjirasi.co.kr에서 판단 근거 확인`,
      link: {
        web_url: deepLink,
        mobile_web_url: deepLink,
      },
    },
    buttons: [
      {
        title: '판단 근거 확인하기',
        link: {
          web_url: deepLink,
          mobile_web_url: deepLink,
        },
      },
    ],
  }

  try {
    await axios.post(
      `${KAKAO_API_BASE}/v2/api/talk/memo/default/send`,
      new URLSearchParams({ template_object: JSON.stringify(message) }),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )
    return true
  } catch (error: any) {
    // 토큰 만료 (401)
    if (error.response?.status === 401) {
      return false
    }
    console.error('[Kakao] 메시지 전송 실패:', error.response?.data)
    return false
  }
}

/**
 * 분석 완료된 공시를 구독 유저 전체에게 알림 전송
 * 호재/악재 모든 강도 발송 — 내용은 강도 레이블만, 세부 분석은 사이트에서 확인
 */
export async function notifySubscribers(disclosure: DisclosureRecord & {
  key_points: string[]
}): Promise<number> {
  if (!disclosure.sentiment || !disclosure.score) return 0

  const users = await getUsersToNotify({
    rcept_no: disclosure.rcept_no,
    corp_code: disclosure.corp_code,
    sentiment: disclosure.sentiment,
    score: disclosure.score,
  })

  if (users.length === 0) return 0

  let sent = 0
  for (const user of users) {
    try {
      let token = user.kakao_access_token

      const success = await sendKakaoMessage(token, {
        corp_name: disclosure.corp_name,
        report_nm: disclosure.report_nm,
        sentiment: disclosure.sentiment as any,
        score: disclosure.score,
        dart_url: disclosure.dart_url,
        rcept_dt: disclosure.rcept_dt,
      })

      if (success) {
        await recordNotification(user.id, disclosure.rcept_no, 'sent')
        sent++
      } else {
        // 토큰 만료 시 리프레시 시도
        if (user.kakao_refresh_token) {
          const newToken = await refreshKakaoToken(user.kakao_refresh_token)
          if (newToken) {
            // DB에 새 토큰 저장
            await upsertUser({
              kakao_id: user.kakao_id,
              nickname: user.nickname,
              kakao_access_token: newToken,
            })

            // 재시도
            const retrySuccess = await sendKakaoMessage(newToken, {
              corp_name: disclosure.corp_name,
              report_nm: disclosure.report_nm,
              sentiment: disclosure.sentiment as any,
              score: disclosure.score,
              dart_url: disclosure.dart_url,
              rcept_dt: disclosure.rcept_dt,
            })
            if (retrySuccess) {
              await recordNotification(user.id, disclosure.rcept_no, 'sent')
              sent++
            }
          }
        }
      }
    } catch (error) {
      console.error(`[Kakao] 유저 ${user.id} 알림 실패:`, error)
    }
  }

  console.log(`[Kakao] ${users.length}명 중 ${sent}명에게 알림 전송 완료`)
  return sent
}
