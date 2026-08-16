'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { DisclosureView } from '@/types'
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  ExternalLink, Search, BarChart3,
  AlertCircle, CheckCircle, Clock, LogOut, Bell,
  X, ChevronRight, FileText, Building2
} from 'lucide-react'

interface UserInfo {
  id: number
  nickname: string
  email?: string
}

interface Stats {
  total: number
  positive: number
  negative: number
  neutral: number
  pending: number
  todayCount: number
}

interface CompanyDisclosure {
  rcept_no: string
  corp_name: string
  corp_code: string
  stock_code: string
  report_nm: string
  rcept_dt: string
  flr_nm: string
  dart_url: string
  sentiment: 'positive' | 'negative' | 'neutral' | null
  score: number | null
  summary: string | null
  key_points: string[]
  analyzed: boolean
}

interface CompanyHistory {
  company: {
    corp_code: string
    corp_name: string
    stock_code: string
    market: string
  }
  disclosures: CompanyDisclosure[]
  total: number
  date_range: { from: string; to: string; months: number }
}

const SENTIMENT_CONFIG = {
  positive: {
    label: '호재',
    icon: TrendingUp,
    badgeClass: 'bg-green-500 text-white',
    cardClass: 'border-l-4 border-l-green-500 bg-green-50/30',
    scoreColor: 'text-green-600',
  },
  negative: {
    label: '악재',
    icon: TrendingDown,
    badgeClass: 'bg-red-500 text-white',
    cardClass: 'border-l-4 border-l-red-500 bg-red-50/30',
    scoreColor: 'text-red-600',
  },
  neutral: {
    label: '중립',
    icon: Minus,
    badgeClass: 'bg-slate-400 text-white',
    cardClass: 'border-l-4 border-l-slate-300 bg-white',
    scoreColor: 'text-slate-500',
  },
}

const MONTH_OPTIONS = [
  { label: '1개월', value: 1 },
  { label: '3개월', value: 3 },
  { label: '6개월', value: 6 },
  { label: '1년', value: 12 },
]

function formatDate(dt: string) {
  if (!dt || dt.length !== 8) return dt
  return `${dt.slice(0, 4)}.${dt.slice(4, 6)}.${dt.slice(6, 8)}`
}

function SentimentBadge({ sentiment, score }: { sentiment: 'positive' | 'negative' | 'neutral', score: number | null }) {
  const config = SENTIMENT_CONFIG[sentiment]
  const Icon = config.icon
  const scoreText = score !== null ? (score > 0 ? `+${score}` : String(score)) : ''
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${config.badgeClass}`}>
      <Icon size={9} />
      {config.label}
      {scoreText && <span className="opacity-80">{scoreText}</span>}
    </span>
  )
}

// ─── 기업 공시 이력 모달 ────────────────────────────────────

function CompanyHistoryModal({
  corpName,
  corpCode,
  onClose,
}: {
  corpName: string
  corpCode?: string
  onClose: () => void
}) {
  const [months, setMonths] = useState(3)
  const [history, setHistory] = useState<CompanyHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedRcept, setExpandedRcept] = useState<string | null>(null)

  const fetchHistory = useCallback(async (m: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ months: String(m) })
      if (corpCode) params.set('corp_code', corpCode)
      else params.set('name', corpName)
      const res = await fetch(`/api/company-history?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '오류 발생')
      setHistory(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [corpName, corpCode])

  useEffect(() => {
    fetchHistory(months)
  }, [fetchHistory, months])

  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const company = history?.company
  const disclosures = history?.disclosures || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* 오버레이 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 패널 */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-500" />
              <h2 className="text-base font-bold text-slate-900">
                {company?.corp_name || corpName}
              </h2>
              {company?.stock_code && (
                <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                  {company.stock_code}
                </span>
              )}
              {company?.market && (
                <span className="text-xs text-slate-400">{company.market}</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">DART 공시 이력 전체 조회</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 기간 선택 탭 */}
        <div className="flex items-center gap-1 px-5 py-3 border-b border-slate-100 shrink-0">
          <span className="text-xs text-slate-500 mr-1">기간</span>
          {MONTH_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setMonths(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                months === opt.value
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {!loading && history && (
            <span className="ml-auto text-xs text-slate-400">
              총 {history.total}건
            </span>
          )}
        </div>

        {/* 공시 목록 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <RefreshCw size={24} className="animate-spin" />
                <p className="text-sm">DART에서 공시 목록을 불러오는 중...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <AlertCircle size={32} className="mb-3 text-red-400" />
              <p className="text-sm font-medium text-red-600">{error}</p>
              <p className="text-xs mt-1 text-slate-400">기업 데이터가 없거나 DART API 오류입니다</p>
              <button
                onClick={() => fetchHistory(months)}
                className="mt-4 px-4 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
              >
                다시 시도
              </button>
            </div>
          ) : disclosures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <FileText size={32} className="mb-3 opacity-40" />
              <p className="text-sm">해당 기간에 공시가 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {disclosures.map(d => (
                <div key={d.rcept_no} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-3">
                    {/* 날짜 */}
                    <span className="text-xs text-slate-400 font-mono shrink-0 pt-0.5 w-20">
                      {formatDate(d.rcept_dt)}
                    </span>

                    {/* 공시명 + 배지 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-sm text-slate-800 leading-snug">{d.report_nm}</span>
                      </div>
                      {d.flr_nm && d.flr_nm !== d.corp_name && (
                        <p className="text-xs text-slate-400 mt-0.5">제출인: {d.flr_nm}</p>
                      )}
                      {/* AI 분석 요약 */}
                      {d.analyzed && d.summary && (
                        <div className="mt-1.5">
                          <button
                            onClick={() => setExpandedRcept(expandedRcept === d.rcept_no ? null : d.rcept_no)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            {expandedRcept === d.rcept_no ? '▲ 분석 접기' : '▼ AI 분석 보기'}
                          </button>
                          {expandedRcept === d.rcept_no && (
                            <p className="text-xs text-slate-600 mt-1 leading-relaxed bg-slate-50 rounded p-2">
                              {d.summary}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 오른쪽: 감성 배지 + DART 버튼 */}
                    <div className="flex items-center gap-2 shrink-0">
                      {d.sentiment && (
                        <SentimentBadge sentiment={d.sentiment} score={d.score} />
                      )}
                      <a
                        href={d.dart_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                        title="DART 원문 보기"
                      >
                        원문
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
          <p className="text-xs text-slate-400 text-center">
            금융감독원 전자공시시스템(DART) 데이터 기준 · AI 분석은 수집된 공시만 표시됩니다
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── 공시 카드 ───────────────────────────────────────────────

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return null
  const pct = Math.abs(score)
  const isPositive = score > 0
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isPositive ? 'bg-green-500' : score < 0 ? 'bg-red-500' : 'bg-gray-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-bold w-10 text-right ${
        isPositive ? 'text-green-600' : score < 0 ? 'text-red-600' : 'text-gray-500'
      }`}>
        {score > 0 ? '+' : ''}{score}
      </span>
    </div>
  )
}

function DisclosureCard({
  d,
  onCompanyClick,
}: {
  d: DisclosureView
  onCompanyClick: (corpName: string, corpCode: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const config = d.sentiment ? SENTIMENT_CONFIG[d.sentiment] : null
  const Icon = config?.icon || Clock

  return (
    <div className={`rounded-xl border bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${
      config?.cardClass || 'border-gray-200'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* 왼쪽: 기업명 + 공시명 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onCompanyClick(d.corp_name, d.corp_code)}
                className="font-bold text-slate-900 text-sm hover:text-blue-700 hover:underline underline-offset-2 transition-colors text-left"
                title={`${d.corp_name} 공시 이력 전체 보기`}
              >
                {d.corp_name}
              </button>
              {d.stock_code && (
                <span className="text-xs text-slate-400 font-mono">{d.stock_code}</span>
              )}
              {config ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${config.badgeClass}`}>
                  <Icon size={10} />
                  {config.label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                  <Clock size={10} />
                  분석중
                </span>
              )}
            </div>
            <p className="text-slate-700 text-sm mt-1 line-clamp-2">{d.report_nm}</p>
            <p className="text-xs text-slate-400 mt-1">{formatDate(d.rcept_dt)}</p>
          </div>

          {/* 오른쪽: DART 링크 */}
          <a
            href={d.dart_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="DART 원문 보기"
          >
            <ExternalLink size={14} />
          </a>
        </div>

        {/* 분석 결과 요약 */}
        {d.summary && (
          <div className="mt-3">
            <p className="text-sm font-medium text-slate-800">{d.summary}</p>
            <ScoreBar score={d.score} />
          </div>
        )}

        {/* 핵심 포인트 */}
        {d.key_points && d.key_points.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {expanded ? '▲ 접기' : '▼ 상세 분석 보기'}
            </button>

            {expanded && (
              <div className="mt-2 space-y-2 text-sm">
                <div className="space-y-1">
                  {d.key_points.map((point, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-slate-400 shrink-0">•</span>
                      <span className="text-slate-700">{point}</span>
                    </div>
                  ))}
                </div>
                {d.reasoning && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-500 font-medium mb-1">판단 근거</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{d.reasoning}</p>
                  </div>
                )}
                {d.affected_aspects && d.affected_aspects.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {d.affected_aspects.map((aspect, i) => (
                      <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {aspect}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 기업 이력 바로가기 */}
        <div className="mt-3 pt-2 border-t border-slate-100">
          <button
            onClick={() => onCompanyClick(d.corp_name, d.corp_code)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors"
          >
            <FileText size={11} />
            {d.corp_name} 공시 이력 전체 보기
            <ChevronRight size={11} />
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color, icon: Icon }: {
  label: string
  value: number
  color: string
  icon: React.ElementType
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 font-medium">{label}</p>
          <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value.toLocaleString()}</p>
        </div>
        <Icon className={`${color} opacity-80`} size={24} />
      </div>
    </div>
  )
}

// ─── 메인 콘텐츠 ─────────────────────────────────────────────

function HomeContent() {
  const [disclosures, setDisclosures] = useState<DisclosureView[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [sentiment, setSentiment] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [companyModal, setCompanyModal] = useState<{ name: string; code: string } | null>(null)
  const searchParams = useSearchParams()

  // 로그인 상태 확인
  useEffect(() => {
    fetch('/api/user/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.user) setUser(data.user)
      })
      .finally(() => setUserLoading(false))
  }, [])

  // URL 파라미터로 로그인 성공/실패 메시지
  useEffect(() => {
    const loginParam = searchParams.get('login')
    const errorParam = searchParams.get('error')
    if (loginParam === 'success') showMessage('success', '카카오 로그인 성공! 이제 알림을 받을 수 있어요 🎉')
    if (errorParam) showMessage('error', '로그인에 실패했습니다. 다시 시도해주세요.')
  }, [searchParams])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    showMessage('success', '로그아웃 되었습니다')
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (sentiment !== 'all') params.set('sentiment', sentiment)
      if (search) params.set('search', search)

      const res = await fetch(`/api/disclosures?${params}`)
      const data = await res.json()
      setDisclosures(data.disclosures || [])
      setStats(data.stats || null)
      setLastUpdated(new Date())
    } catch {
      showMessage('error', '데이터 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [sentiment, search])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData])

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  async function handlePoll() {
    setPolling(true)
    try {
      const res = await fetch('/api/trigger-poll', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        showMessage('success', data.message)
        await fetchData()
      } else {
        showMessage('error', data.error || '오류 발생')
      }
    } catch {
      showMessage('error', '서버 연결 실패')
    } finally {
      setPolling(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
  }

  function openCompanyModal(corpName: string, corpCode: string) {
    setCompanyModal({ name: corpName, code: corpCode })
  }

  const TABS = [
    { key: 'all', label: '전체' },
    { key: 'positive', label: '● 호재' },
    { key: 'negative', label: '● 악재' },
    { key: 'neutral', label: '● 중립' },
  ]

  // 검색 중이고 DB에 결과가 없을 때 → DART 이력 바로가기 버튼 표시 여부
  const showDartHistoryHint = !loading && search && disclosures.length === 0

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 기업 공시 이력 모달 */}
      {companyModal && (
        <CompanyHistoryModal
          corpName={companyModal.name}
          corpCode={companyModal.code}
          onClose={() => setCompanyModal(null)}
        />
      )}

      {/* 헤더 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900">📰 JJIRASI</h1>
              <p className="text-xs text-slate-500">DART 공시를 AI가 실시간 호재/악재 판단</p>
            </div>

            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="text-xs text-slate-400 hidden sm:block">
                  {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 갱신
                </span>
              )}
              <button
                onClick={handlePoll}
                disabled={polling}
                className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={14} className={polling ? 'animate-spin' : ''} />
                {polling ? '수집 중...' : '지금 수집'}
              </button>

              {!userLoading && (
                user ? (
                  <div className="flex items-center gap-2">
                    <a href="/settings" className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors cursor-pointer">
                      <Bell size={13} className="text-yellow-600" />
                      <span className="text-xs font-medium text-slate-700 hidden sm:block">{user.nickname}</span>
                    </a>
                    <button
                      onClick={handleLogout}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="로그아웃"
                    >
                      <LogOut size={14} />
                    </button>
                  </div>
                ) : (
                  <a
                    href="/api/auth/kakao"
                    className="flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-500 text-slate-900 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <span>💬</span>
                    <span className="hidden sm:block">카카오 알림 받기</span>
                    <span className="sm:hidden">카카오</span>
                  </a>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* 메시지 */}
        {message && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {message.text}
          </div>
        )}

        {/* 통계 카드 */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="오늘 공시" value={stats.todayCount} color="text-blue-600" icon={BarChart3} />
            <StatCard label="호재" value={stats.positive} color="text-green-600" icon={TrendingUp} />
            <StatCard label="악재" value={stats.negative} color="text-red-600" icon={TrendingDown} />
            <StatCard label="분석 대기" value={stats.pending} color="text-amber-600" icon={Clock} />
          </div>
        )}

        {/* 검색 + 필터 */}
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="기업명 또는 공시명 검색..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-900 transition-colors"
            >
              검색
            </button>
          </form>

          <div className="flex gap-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setSentiment(tab.key)}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  sentiment === tab.key
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 검색어가 있고 결과가 없을 때 → DART 이력 바로가기 */}
        {showDartHistoryHint && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-800 font-medium mb-2">
              "<span className="font-bold">{search}</span>" 관련 수집된 공시가 없습니다
            </p>
            <p className="text-xs text-blue-600 mb-3">
              DART에서 이 기업의 전체 공시 이력을 직접 조회할 수 있어요
            </p>
            <button
              onClick={() => openCompanyModal(search, '')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <FileText size={14} />
              {search} DART 공시 이력 전체 보기
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* 공시 목록 */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : disclosures.length === 0 && !search ? (
          <div className="text-center py-20 text-slate-500">
            <BarChart3 size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">공시가 없습니다</p>
            <p className="text-sm mt-1">상단의 "지금 수집" 버튼을 눌러 DART에서 최신 공시를 가져오세요</p>
          </div>
        ) : (
          <div className="space-y-3">
            {disclosures.map(d => (
              <DisclosureCard
                key={d.rcept_no}
                d={d}
                onCompanyClick={openCompanyModal}
              />
            ))}
          </div>
        )}

        {/* 푸터 */}
        <div className="text-center text-xs text-slate-400 py-4 border-t border-slate-200">
          <p>JJIRASI · 데이터 출처: 금융감독원 전자공시시스템(DART)</p>
          <p className="mt-1">본 분석은 참고용이며 투자 결정의 근거로 사용하지 마세요.</p>
        </div>
      </main>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <HomeContent />
    </Suspense>
  )
}
