/**
 * Neon PostgreSQL 데이터베이스 모듈
 * 공시, AI 분석 결과, 기업 목록, 유저, 구독 정보 저장
 */

import { neon } from '@neondatabase/serverless'
import { DisclosureRecord, DisclosureView, AnalysisResult } from '@/types'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다')
  return neon(url)
}

// ─── 스키마 초기화 ───────────────────────────────────────────

export async function ensureSchema(): Promise<void> {
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS disclosures (
      id SERIAL PRIMARY KEY,
      rcept_no TEXT UNIQUE NOT NULL,
      corp_name TEXT NOT NULL,
      corp_code TEXT NOT NULL,
      stock_code TEXT,
      report_nm TEXT NOT NULL,
      rcept_dt TEXT NOT NULL,
      corp_cls TEXT,
      dart_url TEXT NOT NULL,
      full_text TEXT,
      sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral')),
      score INTEGER,
      summary TEXT,
      key_points TEXT,
      reasoning TEXT,
      affected_aspects TEXT,
      analyzed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      corp_code TEXT PRIMARY KEY,
      corp_name TEXT NOT NULL,
      stock_code TEXT,
      market TEXT CHECK(market IN ('KOSPI', 'KOSDAQ', 'KONEX', 'OTHER')),
      market_cap REAL DEFAULT 0,
      sector TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      kakao_id TEXT UNIQUE NOT NULL,
      nickname TEXT,
      email TEXT,
      kakao_access_token TEXT,
      kakao_refresh_token TEXT,
      token_expires_at TEXT,
      notify_positive INTEGER DEFAULT 1,
      notify_negative INTEGER DEFAULT 1,
      notify_neutral INTEGER DEFAULT 0,
      min_score INTEGER DEFAULT 30,
      min_market_cap REAL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_login TIMESTAMPTZ
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      corp_code TEXT NOT NULL REFERENCES companies(corp_code) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, corp_code)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      rcept_no TEXT NOT NULL REFERENCES disclosures(rcept_no),
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT DEFAULT 'sent',
      UNIQUE(user_id, rcept_no)
    )
  `
  // 인덱스
  await sql`CREATE INDEX IF NOT EXISTS idx_disc_rcept_dt ON disclosures(rcept_dt DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_disc_sentiment ON disclosures(sentiment)`
  await sql`CREATE INDEX IF NOT EXISTS idx_disc_corp_code ON disclosures(corp_code)`
  await sql`CREATE INDEX IF NOT EXISTS idx_comp_market_cap ON companies(market_cap DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions(user_id)`
}

// ─── 공시 관련 ───────────────────────────────────────────

export async function existsDisclosure(rceptNo: string): Promise<boolean> {
  const sql = getSql()
  const rows = await sql`SELECT 1 FROM disclosures WHERE rcept_no = ${rceptNo}`
  return rows.length > 0
}

export async function insertDisclosure(data: {
  rcept_no: string
  corp_name: string
  corp_code: string
  stock_code: string
  report_nm: string
  rcept_dt: string
  corp_cls: string
  dart_url: string
  full_text?: string | null
}): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO disclosures (rcept_no, corp_name, corp_code, stock_code, report_nm, rcept_dt, corp_cls, dart_url, full_text)
    VALUES (${data.rcept_no}, ${data.corp_name}, ${data.corp_code}, ${data.stock_code}, ${data.report_nm}, ${data.rcept_dt}, ${data.corp_cls}, ${data.dart_url}, ${data.full_text || null})
    ON CONFLICT (rcept_no) DO NOTHING
  `
}

export async function updateAnalysis(rceptNo: string, analysis: AnalysisResult): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE disclosures SET
      sentiment = ${analysis.sentiment},
      score = ${analysis.score},
      summary = ${analysis.summary},
      key_points = ${JSON.stringify(analysis.key_points)},
      reasoning = ${analysis.reasoning},
      affected_aspects = ${JSON.stringify(analysis.affected_aspects)},
      analyzed_at = NOW()
    WHERE rcept_no = ${rceptNo}
  `
}

export async function getPendingDisclosures(): Promise<DisclosureRecord[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM disclosures
    WHERE analyzed_at IS NULL
    ORDER BY created_at ASC
    LIMIT 20
  `
  return rows as unknown as DisclosureRecord[]
}

export interface QueryOptions {
  limit?: number
  offset?: number
  sentiment?: 'positive' | 'negative' | 'neutral' | 'all'
  corpCode?: string
  search?: string
  dateFrom?: string
  dateTo?: string
}

export async function queryDisclosures(options: QueryOptions = {}): Promise<DisclosureView[]> {
  const sql = getSql()
  const sentiment = options.sentiment || 'all'
  const corpCode = options.corpCode || null
  const searchPattern = options.search ? `%${options.search}%` : null
  const limit = options.limit || 50
  const offset = options.offset || 0

  const rows = await sql`
    SELECT * FROM disclosures
    WHERE (${sentiment}::text = 'all' OR sentiment = ${sentiment})
      AND (${corpCode}::text IS NULL OR corp_code = ${corpCode})
      AND (${searchPattern}::text IS NULL OR corp_name ILIKE ${searchPattern} OR report_nm ILIKE ${searchPattern})
    ORDER BY rcept_dt DESC, created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  return (rows as unknown as DisclosureRecord[]).map(row => ({
    ...row,
    key_points: row.key_points ? JSON.parse(row.key_points) : [],
    affected_aspects: row.affected_aspects ? JSON.parse(row.affected_aspects) : [],
  }))
}

export async function getStats() {
  const sql = getSql()
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  const [total, positive, negative, neutral, pending, todayCount, companyCount] = await Promise.all([
    sql`SELECT COUNT(*)::int as c FROM disclosures`,
    sql`SELECT COUNT(*)::int as c FROM disclosures WHERE sentiment='positive'`,
    sql`SELECT COUNT(*)::int as c FROM disclosures WHERE sentiment='negative'`,
    sql`SELECT COUNT(*)::int as c FROM disclosures WHERE sentiment='neutral'`,
    sql`SELECT COUNT(*)::int as c FROM disclosures WHERE analyzed_at IS NULL`,
    sql`SELECT COUNT(*)::int as c FROM disclosures WHERE rcept_dt=${today}`,
    sql`SELECT COUNT(*)::int as c FROM companies`,
  ])

  return {
    total: total[0].c,
    positive: positive[0].c,
    negative: negative[0].c,
    neutral: neutral[0].c,
    pending: pending[0].c,
    todayCount: todayCount[0].c,
    companyCount: companyCount[0].c,
  }
}

// ─── 기업 관련 ───────────────────────────────────────────

export async function upsertCompany(data: {
  corp_code: string
  corp_name: string
  stock_code?: string
  market?: string
  market_cap?: number
  sector?: string
}): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO companies (corp_code, corp_name, stock_code, market, market_cap, sector)
    VALUES (${data.corp_code}, ${data.corp_name}, ${data.stock_code || null}, ${data.market || null}, ${data.market_cap || 0}, ${data.sector || null})
    ON CONFLICT (corp_code) DO UPDATE SET
      corp_name = EXCLUDED.corp_name,
      stock_code = EXCLUDED.stock_code,
      market = EXCLUDED.market,
      market_cap = COALESCE(EXCLUDED.market_cap, companies.market_cap),
      sector = COALESCE(EXCLUDED.sector, companies.sector),
      updated_at = NOW()
  `
}

export async function searchCompanies(query: string, limit = 20): Promise<any[]> {
  const sql = getSql()
  const pattern = `%${query}%`
  const rows = await sql`
    SELECT corp_code, corp_name, stock_code, market, market_cap
    FROM companies
    WHERE (corp_name ILIKE ${pattern} OR stock_code ILIKE ${pattern})
      AND stock_code IS NOT NULL
    ORDER BY market_cap DESC
    LIMIT ${limit}
  `
  return rows as any[]
}

export async function getCompaniesByMarketCap(minMarketCap: number, limit = 100): Promise<any[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT corp_code, corp_name, stock_code, market, market_cap
    FROM companies
    WHERE market_cap >= ${minMarketCap} AND stock_code IS NOT NULL
    ORDER BY market_cap DESC
    LIMIT ${limit}
  `
  return rows as any[]
}

export async function updateMarketCap(corpCode: string, marketCap: number): Promise<void> {
  const sql = getSql()
  await sql`UPDATE companies SET market_cap = ${marketCap} WHERE corp_code = ${corpCode}`
}

export async function updateCompanyByStockCode(stockCode: string, market: string, marketCap: number): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE companies SET market_cap = ${marketCap}, market = ${market}, updated_at = NOW()
    WHERE stock_code = ${stockCode}
  `
}

// ─── 유저 관련 ───────────────────────────────────────────

export async function upsertUser(data: {
  kakao_id: string
  nickname?: string
  email?: string
  kakao_access_token?: string
  kakao_refresh_token?: string
  token_expires_at?: string
}): Promise<number> {
  const sql = getSql()
  const existing = await sql`SELECT id FROM users WHERE kakao_id = ${data.kakao_id}`
  if (existing.length > 0) {
    await sql`
      UPDATE users SET
        nickname = COALESCE(${data.nickname || null}, nickname),
        email = COALESCE(${data.email || null}, email),
        kakao_access_token = COALESCE(${data.kakao_access_token || null}, kakao_access_token),
        kakao_refresh_token = COALESCE(${data.kakao_refresh_token || null}, kakao_refresh_token),
        token_expires_at = COALESCE(${data.token_expires_at || null}, token_expires_at),
        last_login = NOW()
      WHERE kakao_id = ${data.kakao_id}
    `
    return existing[0].id as number
  } else {
    const rows = await sql`
      INSERT INTO users (kakao_id, nickname, email, kakao_access_token, kakao_refresh_token, token_expires_at)
      VALUES (${data.kakao_id}, ${data.nickname || null}, ${data.email || null}, ${data.kakao_access_token || null}, ${data.kakao_refresh_token || null}, ${data.token_expires_at || null})
      RETURNING id
    `
    return rows[0].id as number
  }
}

export async function getUserById(userId: number): Promise<any> {
  const sql = getSql()
  const rows = await sql`SELECT * FROM users WHERE id = ${userId}`
  return rows[0] || null
}

export async function getUserByKakaoId(kakaoId: string): Promise<any> {
  const sql = getSql()
  const rows = await sql`SELECT * FROM users WHERE kakao_id = ${kakaoId}`
  return rows[0] || null
}

export async function updateUserSettings(userId: number, settings: {
  notify_positive?: boolean
  notify_negative?: boolean
  notify_neutral?: boolean
  min_score?: number
  min_market_cap?: number
}): Promise<void> {
  const sql = getSql()
  const { notify_positive, notify_negative, notify_neutral, min_score, min_market_cap } = settings
  await sql`
    UPDATE users SET
      notify_positive = COALESCE(${notify_positive != null ? (notify_positive ? 1 : 0) : null}::integer, notify_positive),
      notify_negative = COALESCE(${notify_negative != null ? (notify_negative ? 1 : 0) : null}::integer, notify_negative),
      notify_neutral = COALESCE(${notify_neutral != null ? (notify_neutral ? 1 : 0) : null}::integer, notify_neutral),
      min_score = COALESCE(${min_score ?? null}::integer, min_score),
      min_market_cap = COALESCE(${min_market_cap ?? null}::real, min_market_cap)
    WHERE id = ${userId}
  `
}

export async function getAllUsersWithTokens(): Promise<any[]> {
  const sql = getSql()
  const rows = await sql`SELECT * FROM users WHERE kakao_access_token IS NOT NULL`
  return rows as any[]
}

// ─── 구독 관련 ───────────────────────────────────────────

export async function subscribe(userId: number, corpCode: string): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO subscriptions (user_id, corp_code) VALUES (${userId}, ${corpCode})
    ON CONFLICT (user_id, corp_code) DO NOTHING
  `
}

export async function unsubscribe(userId: number, corpCode: string): Promise<void> {
  const sql = getSql()
  await sql`DELETE FROM subscriptions WHERE user_id = ${userId} AND corp_code = ${corpCode}`
}

export async function getUserSubscriptions(userId: number): Promise<any[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT c.* FROM subscriptions s
    JOIN companies c ON s.corp_code = c.corp_code
    WHERE s.user_id = ${userId}
    ORDER BY c.market_cap DESC
  `
  return rows as any[]
}

export async function getUsersToNotify(disclosure: {
  rcept_no: string
  corp_code: string
  sentiment: string
  score: number
}): Promise<any[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT u.*, c.market_cap as corp_market_cap
    FROM users u
    JOIN subscriptions s ON u.id = s.user_id
    JOIN companies c ON s.corp_code = c.corp_code
    WHERE s.corp_code = ${disclosure.corp_code}
      AND ABS(${disclosure.score}::integer) >= u.min_score
      AND (u.min_market_cap = 0 OR c.market_cap >= u.min_market_cap)
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = u.id AND n.rcept_no = ${disclosure.rcept_no}
      )
      AND u.kakao_access_token IS NOT NULL
  `

  // JS에서 sentiment별 알림 설정 확인
  return (rows as any[]).filter(u => {
    if (disclosure.sentiment === 'positive') return u.notify_positive
    if (disclosure.sentiment === 'negative') return u.notify_negative
    if (disclosure.sentiment === 'neutral') return u.notify_neutral
    return false
  })
}

export async function recordNotification(userId: number, rceptNo: string, status = 'sent'): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO notifications (user_id, rcept_no, status) VALUES (${userId}, ${rceptNo}, ${status})
    ON CONFLICT (user_id, rcept_no) DO NOTHING
  `
}

// ─── 유저별 AI 분석 ───────────────────────────────────────

export async function upsertUserAnalysis(userId: number, rceptNo: string, analysis: {
  sentiment: string
  score: number
  summary: string
  key_points: string[]
  reasoning: string
  affected_aspects: string[]
}, meta?: {
  corp_name?: string
  report_nm?: string
  rcept_dt?: string
  dart_url?: string
}): Promise<void> {
  const sql = getSql()
  const corp_name = meta?.corp_name || null
  const report_nm = meta?.report_nm || null
  const rcept_dt = meta?.rcept_dt || null
  const dart_url = meta?.dart_url || null
  await sql`
    INSERT INTO user_analyses (user_id, rcept_no, sentiment, score, summary, key_points, reasoning, affected_aspects, analyzed_at, corp_name, report_nm, rcept_dt, dart_url)
    VALUES (${userId}, ${rceptNo}, ${analysis.sentiment}, ${analysis.score}, ${analysis.summary},
            ${JSON.stringify(analysis.key_points)}, ${analysis.reasoning},
            ${JSON.stringify(analysis.affected_aspects)}, NOW(),
            ${corp_name}, ${report_nm}, ${rcept_dt}, ${dart_url})
    ON CONFLICT (user_id, rcept_no) DO UPDATE SET
      sentiment = EXCLUDED.sentiment,
      score = EXCLUDED.score,
      summary = EXCLUDED.summary,
      key_points = EXCLUDED.key_points,
      reasoning = EXCLUDED.reasoning,
      affected_aspects = EXCLUDED.affected_aspects,
      analyzed_at = NOW(),
      corp_name = COALESCE(EXCLUDED.corp_name, user_analyses.corp_name),
      report_nm = COALESCE(EXCLUDED.report_nm, user_analyses.report_nm),
      rcept_dt = COALESCE(EXCLUDED.rcept_dt, user_analyses.rcept_dt),
      dart_url = COALESCE(EXCLUDED.dart_url, user_analyses.dart_url)
  `
}

export async function getUserAnalyses(userId: number, rceptNos: string[]): Promise<Map<string, any>> {
  if (!rceptNos.length) return new Map()
  const sql = getSql()
  const rows = await sql`
    SELECT rcept_no, sentiment, score, summary, key_points, reasoning, affected_aspects
    FROM user_analyses
    WHERE user_id = ${userId} AND rcept_no = ANY(${rceptNos})
  `
  return new Map((rows as any[]).map(r => [r.rcept_no as string, r]))
}

// ─── 분석 실패 재시도 ───────────────────────────────────────

/**
 * summary = '분석 실패'인 레코드를 analyzed_at = NULL로 초기화하여
 * 다음 폴링 사이클에서 재분석 대기열에 들어가도록 함
 */
export async function resetFailedAnalyses(): Promise<number> {
  const sql = getSql()
  const rows = await sql`
    UPDATE disclosures
    SET analyzed_at = NULL, summary = NULL, sentiment = NULL, score = NULL
    WHERE summary = '분석 실패'
    RETURNING rcept_no
  `
  return rows.length
}
