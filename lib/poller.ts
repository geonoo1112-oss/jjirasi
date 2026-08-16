/**
 * DART 공시 폴링 + AI 분석 + 카카오 알림 파이프라인
 */

import { fetchDisclosures, getDartUrl } from './dart'
import { analyzeDisclosure } from './analyzer'
import { notifySubscribers } from './kakao'
import { existsDisclosure, insertDisclosure, updateAnalysis, getPendingDisclosures, queryDisclosures } from './db'

let isPolling = false

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
      if (await existsDisclosure(d.rcept_no)) continue

      await insertDisclosure({
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

      if (process.env.OPENAI_API_KEY) {
        try {
          const result = await analyzeDisclosure({
            corpName: d.corp_name,
            reportNm: d.report_nm,
            rceptDt: d.rcept_dt,
            corpCls: d.corp_cls,
          })

          await updateAnalysis(d.rcept_no, result)
          analyzed++

          console.log(`✅ ${d.corp_name} - ${d.report_nm} → ${result.sentiment} (${result.score > 0 ? '+' : ''}${result.score})`)

          const allDisclosures = await queryDisclosures({ limit: 1 })
          const fullDisclosure = allDisclosures.find(x => x.rcept_no === d.rcept_no)
          if (fullDisclosure && process.env.KAKAO_CLIENT_ID) {
            const n = await notifySubscribers(fullDisclosure as any)
            notified += n
          }

        } catch (err) {
          console.error(`[Analyzer] ${d.corp_name} 분석 실패:`, err)
        }

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

export async function analyzeAllPending(): Promise<number> {
  if (!process.env.OPENAI_API_KEY) return 0

  const pending = await getPendingDisclosures()
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

      await updateAnalysis(disclosure.rcept_no, result)
      analyzed++

      const allDisclosures = await queryDisclosures({ limit: 1 })
      const fullDisclosure = allDisclosures.find(x => x.rcept_no === disclosure.rcept_no)
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

export async function runPipeline() {
  if (isPolling) return { fetched: 0, analyzed: 0, notified: 0 }
  isPolling = true
  try {
    // pollAndAnalyze: 새 공시 수집 + 즉시 분석
    // analyzeAllPending은 제거 → "지금 수집" 버튼으로 기존 pending 공시가
    // 한꺼번에 분석되는 문제 방지 (cron에서만 실행)
    const result = await pollAndAnalyze()
    return result
  } finally {
    isPolling = false
  }
}

// Vercel 서버리스 환경에서는 setInterval이 동작하지 않으므로
// startScheduler는 로컬 개발용으로만 사용
export function startScheduler(): void {
  if (typeof window !== 'undefined') return // 클라이언트에서는 실행 안 함

  const intervalMin = parseInt(process.env.POLL_INTERVAL_MINUTES || '2')
  const intervalMs = intervalMin * 60 * 1000

  console.log(`[Scheduler] 시작 - ${intervalMin}분마다 공시 수집 (로컬 개발용)`)

  setTimeout(() => {
    pollAndAnalyze().catch(console.error)
  }, 5000)

  setInterval(() => {
    if (!isPolling) {
      pollAndAnalyze().catch(console.error)
    }
  }, intervalMs)
}
