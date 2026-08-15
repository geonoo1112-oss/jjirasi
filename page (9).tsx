'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Bell, BellOff, TrendingUp, TrendingDown, Minus, X, Plus, LogIn, Settings, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

interface Company {
  corp_code: string
  corp_name: string
  stock_code: string
  market: string
  market_cap: number
}

interface UserSettings {
  id: number
  nickname: string
  notify_positive: number
  notify_negative: number
  notify_neutral: number
  min_score: number
  min_market_cap: number
}

const MARKET_CAP_PRESETS = [
  { label: '전체', value: 0 },
  { label: '1조+', value: 10000 },
  { label: '5조+', value: 50000 },
  { label: '10조+', value: 100000 },
  { label: '50조+', value: 500000 },
]

export default function SettingsPage() {
  const [user, setUser] = useState<UserSettings | null>(null)
  const [subscriptions, setSubscriptions] = useState<Company[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Company[]>([])
  const [minCapFilter, setMinCapFilter] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // 유저 정보 + 구독 목록 로드
  useEffect(() => {
    loadUserData()
  }, [])

  async function loadUserData() {
    setLoading(true)
    try {
      const res = await fetch('/api/subscriptions')
      if (res.status === 401) {
        setUser(null)
        setLoading(false)
        return
      }
      const data = await res.json()
      setUser(data.user)
      setSubscriptions(data.subscriptions || [])
    } catch {
      showMessage('데이터 로드 실패')
    } finally {
      setLoading(false)
    }
  }

  // 기업 검색
  const searchCompanies = useCallback(async (q: string, minCap: number) => {
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (minCap > 0) params.set('min_cap', String(minCap))
      const res = await fetch(`/api/companies/search?${params}`)
      const data = await res.json()
      setSearchResults(data.companies || [])
    } catch {
      setSearchResults([])
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      searchCompanies(searchQuery, minCapFilter)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, minCapFilter, searchCompanies])

  function showMessage(msg: string) {
    setMessage(msg)
    setTimeout(() => setMessage(null), 3000)
  }

  async function handleSubscribe(company: Company) {
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corp_code: company.corp_code }),
    })
    if (res.ok) {
      setSubscriptions(prev => [...prev, company])
      showMessage(`${company.corp_name} 구독 추가!`)
    }
  }

  async function handleUnsubscribe(corpCode: string, corpName: string) {
    const res = await fetch('/api/subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corp_code: corpCode }),
    })
    if (res.ok) {
      setSubscriptions(prev => prev.filter(s => s.corp_code !== corpCode))
      showMessage(`${corpName} 구독 해제`)
    }
  }

  async function handleSaveSettings() {
    if (!user) return
    setSaving(true)
    try {
      await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notify_positive: user.notify_positive,
          notify_negative: user.notify_negative,
          notify_neutral: user.notify_neutral,
          min_score: user.min_score,
          min_market_cap: user.min_market_cap,
        }),
      })
      showMessage('설정 저장 완료!')
    } finally {
      setSaving(false)
    }
  }

  async function handleImportCompanies() {
    setImporting(true)
    try {
      const res = await fetch('/api/companies/import', { method: 'POST' })
      const data = await res.json()
      showMessage(data.message || '기업 목록 등록 완료')
      searchCompanies(searchQuery, minCapFilter)
    } catch {
      showMessage('기업 목록 등록 실패')
    } finally {
      setImporting(false)
    }
  }

  const subscribedCodes = new Set(subscriptions.map(s => s.corp_code))

  const formatMarketCap = (cap: number) => {
    if (!cap) return '-'
    if (cap >= 100000) return `${(cap / 10000).toFixed(0)}조`
    return `${(cap / 1000).toFixed(1)}천억`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">로딩 중...</div>
      </div>
    )
  }

  // 로그인 안 된 경우
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">📰 JJIRASI</h1>
          <p className="text-slate-500">카카오 로그인 후 원하는 기업의 전자공시 알림을 받으세요</p>
        </div>

        <a
          href="/api/auth/kakao"
          className="flex items-center gap-3 bg-[#FEE500] text-[#3C1E1E] font-bold px-8 py-4 rounded-xl hover:bg-[#FDD800] transition-colors shadow-md"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path fillRule="evenodd" clipRule="evenodd" d="M10 2C5.58 2 2 4.92 2 8.5c0 2.26 1.4 4.25 3.5 5.44l-.9 3.3c-.08.3.24.55.5.38L9 15.5c.33.04.66.06 1 .06 4.42 0 8-2.92 8-6.5S14.42 2 10 2z" fill="#3C1E1E"/>
          </svg>
          카카오로 시작하기
        </a>

        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1">
          <ChevronLeft size={14} /> 대시보드로 돌아가기
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-slate-600">
              <ChevronLeft size={20} />
            </Link>
            <div>
              <h1 className="font-bold text-slate-900 flex items-center gap-2">
                <Settings size={16} /> 알림 설정
              </h1>
              <p className="text-xs text-slate-500">{user.nickname}님</p>
            </div>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* 메시지 */}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm p-3 rounded-lg">
            {message}
          </div>
        )}

        {/* 알림 종류 설정 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-bold text-slate-900">알림 종류</h2>

          <div className="space-y-3">
            {[
              { key: 'notify_positive', label: '호재 알림', icon: TrendingUp, color: 'text-green-600' },
              { key: 'notify_negative', label: '악재 알림', icon: TrendingDown, color: 'text-red-600' },
              { key: 'notify_neutral', label: '중립 알림', icon: Minus, color: 'text-slate-500' },
            ].map(({ key, label, icon: Icon, color }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={16} className={color} />
                  <span className="text-sm text-slate-700">{label}</span>
                </div>
                <button
                  onClick={() => setUser(prev => prev ? { ...prev, [key]: prev[key as keyof UserSettings] ? 0 : 1 } : prev)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    (user as any)[key] ? 'bg-blue-500' : 'bg-slate-200'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    (user as any)[key] ? 'translate-x-7' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            ))}
          </div>

          {/* 최소 점수 */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-slate-700">최소 분석 점수</span>
              <span className="text-sm font-bold text-blue-600">{user.min_score}점 이상</span>
            </div>
            <input
              type="range"
              min="0"
              max="80"
              step="10"
              value={user.min_score}
              onChange={e => setUser(prev => prev ? { ...prev, min_score: parseInt(e.target.value) } : prev)}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>0 (전부)</span>
              <span>40 (중간)</span>
              <span>80 (중요만)</span>
            </div>
          </div>

          {/* 시가총액 필터 */}
          <div>
            <p className="text-sm text-slate-700 mb-2">시가총액 기준 (이 이상인 기업만 알림)</p>
            <div className="flex gap-2 flex-wrap">
              {MARKET_CAP_PRESETS.map(preset => (
                <button
                  key={preset.value}
                  onClick={() => setUser(prev => prev ? { ...prev, min_market_cap: preset.value } : prev)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    user.min_market_cap === preset.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 구독 기업 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">구독 기업 ({subscriptions.length})</h2>
          </div>

          {subscriptions.length > 0 ? (
            <div className="space-y-2">
              {subscriptions.map(s => (
                <div key={s.corp_code} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <div>
                    <span className="font-medium text-sm text-slate-800">{s.corp_name}</span>
                    <span className="text-xs text-slate-400 ml-2">{s.stock_code} · {s.market}</span>
                    {s.market_cap > 0 && (
                      <span className="text-xs text-slate-400 ml-1">· {formatMarketCap(s.market_cap)}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleUnsubscribe(s.corp_code, s.corp_name)}
                    className="text-slate-400 hover:text-red-500 p-1"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">아직 구독한 기업이 없어요</p>
          )}
        </div>

        {/* 기업 검색 + 추가 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-bold text-slate-900">기업 추가</h2>

          {/* 시가총액 필터 */}
          <div className="flex gap-2 flex-wrap">
            {MARKET_CAP_PRESETS.map(preset => (
              <button
                key={preset.value}
                onClick={() => setMinCapFilter(preset.value)}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                  minCapFilter === preset.value
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* 검색 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="기업명 또는 종목코드 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 검색 결과 */}
          {searchResults.length === 0 && searchQuery === '' && (
            <div className="text-center py-6">
              <p className="text-sm text-slate-400">기업을 검색하거나</p>
              <button
                onClick={handleImportCompanies}
                disabled={importing}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {importing ? '전체 기업 목록 불러오는 중...' : '▶ 전체 코스피/코스닥 기업 목록 불러오기'}
              </button>
              <p className="text-xs text-slate-400 mt-1">(최초 1회, 약 30초 소요)</p>
            </div>
          )}

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {searchResults.map(company => {
              const isSubscribed = subscribedCodes.has(company.corp_code)
              return (
                <div key={company.corp_code} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-slate-800">{company.corp_name}</span>
                    <span className="text-xs text-slate-400 ml-2">{company.stock_code}</span>
                    <span className={`text-xs ml-1 px-1.5 py-0.5 rounded ${
                      company.market === 'KOSPI' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                    }`}>{company.market}</span>
                    {company.market_cap > 0 && (
                      <span className="text-xs text-slate-400 ml-1">{formatMarketCap(company.market_cap)}</span>
                    )}
                  </div>
                  <button
                    onClick={() => isSubscribed ? handleUnsubscribe(company.corp_code, company.corp_name) : handleSubscribe(company)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isSubscribed
                        ? 'text-red-400 hover:bg-red-50'
                        : 'text-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    {isSubscribed ? <X size={14} /> : <Plus size={14} />}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
