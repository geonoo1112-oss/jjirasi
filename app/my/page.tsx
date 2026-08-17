'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, Minus,
  ExternalLink, Clock, LogOut, Bell,
  AlertCircle, ChevronLeft, RefreshCw, User
} from 'lucide-react'

// ─── 타입 ────────────────────────────────────────────────────

interface UserInfo { id: number; nickname: string }

interface UserAnalysis {
  id: number
  rcept_no: string
  corp_name: string
  report_nm: string
  rcept_dt: string
  dart_url: string
  stock_code: string | null
  sentiment: 'positive' | 'negative' | 'neutral' | null
  score: number | null
  summary: string | null
  key_points: string[]
  reasoning: string
  affected_aspects: string[]
  analyzed_at: string
}

// ─── 상수 ────────────────────────────────────────────────────

const SENTIMENT_CONFIG = {
  positive: {
    label: '호재', icon: TrendingUp,
    badgeClass: 'bg-green-500 text-white',
    cardClass: 'border-l-4 border-l-green-500 bg-green-50/30',
    scoreColor: 'text-green-600',
  },
  negative: {
    label: '악재', icon: TrendingDown,
    badgeClass: 'bg-red-500 text-white',
    cardClass: 'border-l-4 border-l-red-500 bg-red-50/30',
    scoreColor: 'text-red-600',
  },
  neutral: {
    label: '중립', icon: Minus,
    badgeClass: 'bg-slate-400 text-white',
    cardClass: 'border-l-4 border-l-slate-300 bg-white',
    scoreColor: 'text-slate-500',
  },
}

function formatDate(dt: string) {
  if (!dt || dt.length !== 8) return dt
  return `${dt.slice(0, 4)}.${dt.slice(4, 6)}.${dt.slice(6, 8)}`
}

function formatDateTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── 점수 바 ────────────────────────────────────────────────

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
      <span className={`text-xs font-mono font-bold w-10 text-right ${isPositive ? 'text-green-600' : score < 0 ? 'text-red-600' : 'text-gray-500'}`}>
        {score > 0 ? '+' : ''}{score}
      </span>
    </div>
  )
}

// ─── 분석 카드 ───────────────────────────────────────────────

function AnalysisCard({ item }: { item: UserAnalysis }) {
  const [expanded, setExpanded] = useState(false)
  const config = item.sentiment ? SENTIMENT_CONFIG[item.sentiment] : null
  const Icon = config?.icon || Clock

  return (
    <div className={`rounded-xl border bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${config?.cardClass || 'border-gray-200'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-sm">{item.corp_name}</span>
              {item.stock_code && (
                <span className="text-xs text-slate-400 font-mono">{item.stock_code}</span>
              )}
              {config ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${config.badgeClass}`}>
                  <Icon size={10} />{config.label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                  <Clock size={10} />분석중
                </span>
              )}
            </div>
            <p className="text-slate-700 text-sm mt-1 line-clamp-2">{item.report_nm}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-slate-400">{formatDate(item.rcept_dt)}</p>
              <span className="text-slate-300">•</span>
              <p className="text-xs text-slate-400">분석: {formatDateTime(item.analyzed_at)}</p>
            </div>
          </div>
          <a
            href={item.dart_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="DART 원문 보기"
          >
            <ExternalLink size={14} />
          </a>
        </div>

        {item.summary && (
          <div className="mt-3">
            <p className="text-sm font-medium text-slate-800">{item.summary}</p>
            <ScoreBar score={item.score} />
          </div>
        )}

        {item.key_points && item.key_points.length > 0 && (
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
                  {item.key_points.map((p, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-slate-400 shrink-0">•</span>
                      <span className="text-slate-700">{p}</span>
                    </div>
                  ))}
                </div>
                {item.reasoning && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-500 font-medium mb-1">판단 근거</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.reasoning}</p>
                  </div>
                )}
                {item.affected_aspects && item.affected_aspects.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {item.affected_aspects.map((a, i) => (
                      <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{a}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────

export default function MyAnalysesPage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [analyses, setAnalyses] = useState<UserAnalysis[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all')

  // 유저 정보 조회
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { setUser(d.user || null); setUserLoading(false) })
      .catch(() => setUserLoading(false))
  }, [])

  // 내 분석 기록 조회
  const fetchAnalyses = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/my-analyses?limit=100')
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || '오류')
      setAnalyses(data.analyses)
      setTotal(data.total)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!userLoading && user) fetchAnalyses()
  }, [userLoading, user, fetchAnalyses])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  const filtered = filter === 'all'
    ? analyses
    : analyses.filter(a => a.sentiment === filter)

  // 통계
  const stats = {
    total: analyses.length,
    positive: analyses.filter(a => a.sentiment === 'positive').length,
    negative: analyses.filter(a => a.sentiment === 'negative').length,
    neutral: analyses.filter(a => a.sentiment === 'neutral').length,
  }

  const TABS = [
    { key: 'all', label: `전체 (${stats.total})` },
    { key: 'positive', label: `호재 (${stats.positive})` },
    { key: 'negative', label: `악재 (${stats.negative})` },
    { key: 'neutral', label: `중립 (${stats.neutral})` },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <a href="/" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm transition-colors">
                <ChevronLeft size={16} />
                <span className="hidden sm:block">전체 공시</span>
              </a>
              <div>
                <h1 className="text-lg font-bold text-slate-900">📋 내 분석 기록</h1>
                <p className="text-xs text-slate-500">내가 AI 분석한 공시 목록 (비공개)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAnalyses}
                disabled={loading}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span className="hidden sm:block">새로고침</span>
              </button>
              {!userLoading && user && (
                <div className="flex items-center gap-2">
                  <a
                    href="/settings"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors"
                  >
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
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* 로그인 필요 안내 */}
        {!userLoading && !user && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
            <User size={32} className="text-yellow-500 mx-auto mb-3" />
            <p className="text-slate-800 font-semibold mb-2">로그인이 필요합니다</p>
            <p className="text-sm text-slate-500 mb-4">카카오 로그인 후 내 분석 기록을 확인할 수 있어요</p>
            <a
              href="/api/auth/kakao"
              className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <span>💬</span> 카카오로 로그인
            </a>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* 분석 기록 있을 때 */}
        {user && !loading && analyses.length === 0 && !error && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500 text-sm">아직 분석한 공시가 없어요</p>
            <p className="text-slate-400 text-xs mt-1">메인 화면에서 공시를 클릭해 AI 분석을 시작해보세요</p>
            <a
              href="/"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              공시 보러 가기
            </a>
          </div>
        )}

        {user && (analyses.length > 0 || loading) && (
          <>
            {/* 필터 탭 */}
            <div className="flex gap-1 flex-wrap">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key as any)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    filter === tab.key
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 로딩 */}
            {loading && (
              <div className="flex justify-center py-10">
                <RefreshCw size={20} className="animate-spin text-slate-400" />
              </div>
            )}

            {/* 카드 목록 */}
            {!loading && (
              <div className="space-y-3">
                {filtered.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-400">
                    해당 유형의 분석 기록이 없어요
                  </div>
                ) : (
                  filtered.map(item => <AnalysisCard key={item.id} item={item} />)
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
