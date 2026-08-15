/**
 * DART 공시 폴링 + AI 분석 + 카카오 알림 파이프라인
 * 1~2분 주기로 새 공시 수집 → 즉시 AI 분석 → 구독 유저에게 카카오톡 알림
 */

import { fetchDisclosures, getDartUrl } from './dart'
import { analyzeDisclosure } from './analyzer'
import { notifySubscribers } from './kakao'
import { existsDisclosure, insertDisclosure, updateAnalysis, getPendingDisclosures, queryDisclosures } from './db'

let isPolling = false

/**
 * 새 공시 가져오기 → DB 저장 → 즉시 AI 분석 → 카카오 알림
 * (속도 우선: 저장 직후 바로 분석)
 */
export async function pollAndAnalyze(): Promise<{ fetched: number; analyzed: number; notified: number }> {
  const apiKey = process.env.DART_API_KEY
  if (!apiKey) {
    console.warn('[Poller] DART_API_KEY 없음')
    return { fetched: 0, analyzed: 0, notified: 0 }
  }

  console.log('[Poller] 공시 확인 중...')
  let fetched = 0, analyzed = 0, notified = 0

  try {
    const disclosures = await fetchDisclosures({ pageCount: 40 })

    for (const d of disclosures) {
      if (existsDisclosure(d.rcept_no)) continue

      // 1. DB에 저장
      insertDisclosure({
        rcept_no: d.rcept_no,
        corp_name: d.corp_name,
        corp_code: d.corp_code,
        stock_code: d.stock_code || '',
        report_nm: d.report_nm,
        rcept_dt: d.rcept_dt,
        corp_cls: d.corp_cls,
        dart_url: getDartUrl(d.rcept_no),
        full_text: null,
      })
      fetched++

      // 2. 즉시 AI 분석 (1분 이내 목표)
      if (process.env.OPENAI_API_KEY) {
        try {
          const result = await analyzeDisclosure({
            corpName: d.corp_name,
            reportNm: d.report_nm,
            rceptDt: d.rcept_dt,
            corpCls: d.corp_cls,
          })

          updateAnalysis(d.rcept_no, result)
          analyzed++

          console.log(`✅ ${d.corp_name} - ${d.report_nm} → ${result.sentiment} (${result.score > 0 ? '+' : ''}${result.score})`)

          // 3. 카카오톡 알림 (구독 유저에게)
          const fullDisclosure = queryDisclosures({ limit: 1 }).find(x => x.rcept_no === d.rcept_no)
          if (fullDisclosure && process.env.KAKAO_CLIENT_ID) {
            const n = await notifySubscribers(fullDisclosure as any)
            notified += n
          }

        } catch (err) {
          console.error(`[Analyzer] ${d.corp_name} 분석 실패:`, err)
        }

        // API 레이트 리밋 방지 딜레이
        await new Promise(r => setTimeout(r, 300))
      }
    }

    if (fetched > 0) {
      console.log(`[Poller] 새 공시 ${fetched}건 수집, ${analyzed}건 분석, ${notified}건 알림`)
    }

  } catch (error) {
    console.error('[Poller] 오류:', error)
  }

  return { fetched, analyzed, notified }
}

/**
 * 미분석 공시 일괄 분석 (서버 재시작 후 밀린 것 처리)
 */
export async function analyzeAllPending(): Promise<number> {
  if (!process.env.OPENAI_API_KEY) return 0

  const pending = getPendingDisclosures()
  if (!pending.length) return 0

  console.log(`[Analyzer] 미분석 ${pending.length}건 처리 중...`)
  let analyzed = 0

  for (const disclosure of pending) {
    try {
      const result = await analyzeDisclosure({
        corpName: disclosure.corp_name,
        reportNm: disclosure.report_nm,
        rceptDt: disclosure.rcept_dt,
        corpCls: (disclosure as any).corp_cls || 'Y',
        fullText: disclosure.full_text,
      })

      updateAnalysis(disclosure.rcept_no, result)
      analyzed++

      // 카카오 알림
      const fullDisclosure = queryDisclosures({ limit: 1 }).find(x => x.rcept_no === disclosure.rcept_no)
      if (fullDisclosure && process.env.KAKAO_CLIENT_ID) {
        await notifySubscribers(fullDisclosure as any)
      }

      await new Promise(r => setTimeout(r, 300))
    } catch (err) {
      console.error(`[Analyzer] ${disclosure.corp_name} 실패:`, err)
    }
  }

  return analyzed
}

/**
 * 전체 파이프라인 실행 (수동 트리거용)
 */
export async function runPipeline() {
  if (isPolling) return { fetched: 0, analyzed: 0, notified: 0 }
  isPolling = true
  try {
    const result = await pollAndAnalyze()
    // 미분석 밀린 것도 처리
    await analyzeAllPending()
    return result
  } finally {
    isPolling = false
  }
}

let schedulerStarted = false

/**
 * 백그라운드 스케줄러 시작
 * 기본 2분마다 폴링 (DART 공시는 보통 수분 간격으로 올라옴)
 */
export function startScheduler(): void {
  if (schedulerStarted) return
  schedulerStarted = true

  const intervalMin = parseInt(process.env.POLL_INTERVAL_MINUTES || '2')
  const intervalMs = intervalMin * 60 * 1000

  console.log(`[Scheduler] 시작 - ${intervalMin}분마다 공시 수집`)

  // 시작 5초 후 첫 실행
  setTimeout(() => {
    pollAndAnalyze().catch(console.error)
  }, 5000)

  // 이후 주기 실행
  setInterval(() => {
    if (!isPolling) {
      pollAndAnalyze().catch(console.error)
    }
  }, intervalMs)
}
