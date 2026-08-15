/**
 * SQLite 데이터베이스 모듈
 * 공시, AI 분석 결과, 기업 목록, 유저, 구독 정보 저장
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { DisclosureRecord, DisclosureView, AnalysisResult } from '@/types'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'dart.db')

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }

    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    db.exec(`
      -- 공시 테이블
      CREATE TABLE IF NOT EXISTS disclosures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        analyzed_at TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      -- 전체 상장 기업 목록 (코스피 + 코스닥)
      CREATE TABLE IF NOT EXISTS companies (
        corp_code TEXT PRIMARY KEY,
        corp_name TEXT NOT NULL,
        stock_code TEXT,
        market TEXT CHECK(market IN ('KOSPI', 'KOSDAQ', 'KONEX', 'OTHER')),
        market_cap REAL DEFAULT 0,         -- 시가총액 (억원)
        sector TEXT,                        -- 업종
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      -- 유저 (카카오 로그인)
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kakao_id TEXT UNIQUE NOT NULL,
        nickname TEXT,
        email TEXT,
        kakao_access_token TEXT,
        kakao_refresh_token TEXT,
        token_expires_at TEXT,
        -- 알림 설정
        notify_positive INTEGER DEFAULT 1,  -- 호재 알림
        notify_negative INTEGER DEFAULT 1,  -- 악재 알림
        notify_neutral INTEGER DEFAULT 0,   -- 중립 알림
        min_score INTEGER DEFAULT 30,       -- 최소 점수 (절대값)
        -- 시가총액 필터 (억원, 0이면 제한 없음)
        min_market_cap REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        last_login TEXT
      );

      -- 기업 구독 (유저 ↔ 기업 N:M)
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        corp_code TEXT NOT NULL REFERENCES companies(corp_code) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        UNIQUE(user_id, corp_code)
      );

      -- 알림 발송 이력
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        rcept_no TEXT NOT NULL REFERENCES disclosures(rcept_no),
        sent_at TEXT DEFAULT (datetime('now', 'localtime')),
        status TEXT DEFAULT 'sent',
        UNIQUE(user_id, rcept_no)
      );

      -- 인덱스
      CREATE INDEX IF NOT EXISTS idx_disc_rcept_dt ON disclosures(rcept_dt DESC);
      CREATE INDEX IF NOT EXISTS idx_disc_sentiment ON disclosures(sentiment);
      CREATE INDEX IF NOT EXISTS idx_disc_corp_code ON disclosures(corp_code);
      CREATE INDEX IF NOT EXISTS idx_comp_market ON companies(market);
      CREATE INDEX IF NOT EXISTS idx_comp_market_cap ON companies(market_cap DESC);
      CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sub_corp ON subscriptions(corp_code);
    `)
  }

  return db
}

// ─── 공시 관련 ───────────────────────────────────────────

export function existsDisclosure(rceptNo: string): boolean {
  const db = getDb()
  return !!db.prepare('SELECT 1 FROM disclosures WHERE rcept_no = ?').get(rceptNo)
}

export function insertDisclosure(data: {
  rcept_no: string
  corp_name: string
  corp_code: string
  stock_code: string
  report_nm: string
  rcept_dt: string
  corp_cls: string
  dart_url: string
  full_text?: string | null
}): number {
  const db = getDb()
  const result = db.prepare(`
    INSERT OR IGNORE INTO disclosures
      (rcept_no, corp_name, corp_code, stock_code, report_nm, rcept_dt, corp_cls, dart_url, full_text)
    VALUES
      (@rcept_no, @corp_name, @corp_code, @stock_code, @report_nm, @rcept_dt, @corp_cls, @dart_url, @full_text)
  `).run(data)
  return result.lastInsertRowid as number
}

export function updateAnalysis(rceptNo: string, analysis: AnalysisResult): void {
  const db = getDb()
  db.prepare(`
    UPDATE disclosures SET
      sentiment = @sentiment,
      score = @score,
      summary = @summary,
      key_points = @key_points,
      reasoning = @reasoning,
      affected_aspects = @affected_aspects,
      analyzed_at = datetime('now', 'localtime')
    WHERE rcept_no = @rcept_no
  `).run({
    rcept_no: rceptNo,
    sentiment: analysis.sentiment,
    score: analysis.score,
    summary: analysis.summary,
    key_points: JSON.stringify(analysis.key_points),
    reasoning: analysis.reasoning,
    affected_aspects: JSON.stringify(analysis.affected_aspects),
  })
}

export function getPendingDisclosures(): DisclosureRecord[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM disclosures
    WHERE analyzed_at IS NULL
    ORDER BY created_at ASC
    LIMIT 20
  `).all() as DisclosureRecord[]
}

export interface QueryOptions {
  limit?: number
  offset?: number
  sentiment?: 'positive' | 'negative' | 'neutral' | 'all'
  corpCode?: string
  search?: string
}

export function queryDisclosures(options: QueryOptions = {}): DisclosureView[] {
  const db = getDb()
  const conditions: string[] = ['1=1']
  const params: Record<string, unknown> = {}

  if (options.sentiment && options.sentiment !== 'all') {
    conditions.push('sentiment = @sentiment')
    params.sentiment = options.sentiment
  }
  if (options.corpCode) {
    conditions.push('corp_code = @corp_code')
    params.corp_code = options.corpCode
  }
  if (options.search) {
    conditions.push('(corp_name LIKE @search OR report_nm LIKE @search)')
    params.search = `%${options.search}%`
  }

  const rows = db.prepare(`
    SELECT * FROM disclosures
    WHERE ${conditions.join(' AND ')}
    ORDER BY rcept_dt DESC, created_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: options.limit || 50, offset: options.offset || 0 }) as DisclosureRecord[]

  return rows.map(row => ({
    ...row,
    key_points: row.key_points ? JSON.parse(row.key_points) : [],
    affected_aspects: row.affected_aspects ? JSON.parse(row.affected_aspects) : [],
  }))
}

export function getStats() {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return {
    total: (db.prepare('SELECT COUNT(*) as c FROM disclosures').get() as any).c,
    positive: (db.prepare("SELECT COUNT(*) as c FROM disclosures WHERE sentiment='positive'").get() as any).c,
    negative: (db.prepare("SELECT COUNT(*) as c FROM disclosures WHERE sentiment='negative'").get() as any).c,
    neutral: (db.prepare("SELECT COUNT(*) as c FROM disclosures WHERE sentiment='neutral'").get() as any).c,
    pending: (db.prepare('SELECT COUNT(*) as c FROM disclosures WHERE analyzed_at IS NULL').get() as any).c,
    todayCount: (db.prepare('SELECT COUNT(*) as c FROM disclosures WHERE rcept_dt=?').get(today) as any).c,
    companyCount: (db.prepare('SELECT COUNT(*) as c FROM companies').get() as any).c,
  }
}

// ─── 기업 관련 ───────────────────────────────────────────

export function upsertCompany(data: {
  corp_code: string
  corp_name: string
  stock_code?: string
  market?: string
  market_cap?: number
  sector?: string
}): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO companies (corp_code, corp_name, stock_code, market, market_cap, sector)
    VALUES (@corp_code, @corp_name, @stock_code, @market, @market_cap, @sector)
    ON CONFLICT(corp_code) DO UPDATE SET
      corp_name = excluded.corp_name,
      stock_code = excluded.stock_code,
      market = excluded.market,
      market_cap = COALESCE(excluded.market_cap, companies.market_cap),
      sector = COALESCE(excluded.sector, companies.sector),
      updated_at = datetime('now', 'localtime')
  `).run({
    corp_code: data.corp_code,
    corp_name: data.corp_name,
    stock_code: data.stock_code || null,
    market: data.market || null,
    market_cap: data.market_cap || 0,
    sector: data.sector || null,
  })
}

export function searchCompanies(query: string, limit = 20): any[] {
  const db = getDb()
  return db.prepare(`
    SELECT corp_code, corp_name, stock_code, market, market_cap
    FROM companies
    WHERE (corp_name LIKE @q OR stock_code LIKE @q)
      AND stock_code IS NOT NULL
    ORDER BY market_cap DESC
    LIMIT @limit
  `).all({ q: `%${query}%`, limit })
}

export function getCompaniesByMarketCap(minMarketCap: number, limit = 100): any[] {
  const db = getDb()
  return db.prepare(`
    SELECT corp_code, corp_name, stock_code, market, market_cap
    FROM companies
    WHERE market_cap >= @min AND stock_code IS NOT NULL
    ORDER BY market_cap DESC
    LIMIT @limit
  `).all({ min: minMarketCap, limit })
}

export function updateMarketCap(corpCode: string, marketCap: number): void {
  const db = getDb()
  db.prepare('UPDATE companies SET market_cap = ? WHERE corp_code = ?').run(marketCap, corpCode)
}

// ─── 유저 관련 ───────────────────────────────────────────

export function upsertUser(data: {
  kakao_id: string
  nickname?: string
  email?: string
  kakao_access_token?: string
  kakao_refresh_token?: string
  token_expires_at?: string
}): number {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE kakao_id = ?').get(data.kakao_id) as any
  if (existing) {
    db.prepare(`
      UPDATE users SET
        nickname = COALESCE(@nickname, nickname),
        email = COALESCE(@email, email),
        kakao_access_token = COALESCE(@kakao_access_token, kakao_access_token),
        kakao_refresh_token = COALESCE(@kakao_refresh_token, kakao_refresh_token),
        token_expires_at = COALESCE(@token_expires_at, token_expires_at),
        last_login = datetime('now', 'localtime')
      WHERE kakao_id = @kakao_id
    `).run(data)
    return existing.id
  } else {
    const result = db.prepare(`
      INSERT INTO users (kakao_id, nickname, email, kakao_access_token, kakao_refresh_token, token_expires_at)
      VALUES (@kakao_id, @nickname, @email, @kakao_access_token, @kakao_refresh_token, @token_expires_at)
    `).run(data)
    return result.lastInsertRowid as number
  }
}

export function getUserById(userId: number): any {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId)
}

export function getUserByKakaoId(kakaoId: string): any {
  return getDb().prepare('SELECT * FROM users WHERE kakao_id = ?').get(kakaoId)
}

export function updateUserSettings(userId: number, settings: {
  notify_positive?: boolean
  notify_negative?: boolean
  notify_neutral?: boolean
  min_score?: number
  min_market_cap?: number
}): void {
  const db = getDb()
  const fields = Object.entries(settings)
    .filter(([_, v]) => v !== undefined)
    .map(([k]) => `${k} = @${k}`)
    .join(', ')
  if (!fields) return
  db.prepare(`UPDATE users SET ${fields} WHERE id = @id`).run({ ...settings, id: userId })
}

export function getAllUsersWithTokens(): any[] {
  return getDb().prepare(`
    SELECT * FROM users WHERE kakao_access_token IS NOT NULL
  `).all()
}

// ─── 구독 관련 ───────────────────────────────────────────

export function subscribe(userId: number, corpCode: string): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO subscriptions (user_id, corp_code) VALUES (?, ?)
  `).run(userId, corpCode)
}

export function unsubscribe(userId: number, corpCode: string): void {
  getDb().prepare(`
    DELETE FROM subscriptions WHERE user_id = ? AND corp_code = ?
  `).run(userId, corpCode)
}

export function getUserSubscriptions(userId: number): any[] {
  return getDb().prepare(`
    SELECT c.* FROM subscriptions s
    JOIN companies c ON s.corp_code = c.corp_code
    WHERE s.user_id = ?
    ORDER BY c.market_cap DESC
  `).all(userId)
}

/**
 * 특정 공시에 대해 알림을 받아야 할 유저 목록 조회
 * - 해당 기업을 구독한 유저
 * - 알림 설정 (sentiment, min_score) 충족
 * - 시가총액 필터 충족
 * - 이미 알림 보낸 유저 제외
 */
export function getUsersToNotify(disclosure: {
  rcept_no: string
  corp_code: string
  sentiment: string
  score: number
}): any[] {
  const db = getDb()
  const sentimentCol = `notify_${disclosure.sentiment}` // notify_positive / notify_negative / notify_neutral

  return db.prepare(`
    SELECT u.*, c.market_cap as corp_market_cap
    FROM users u
    JOIN subscriptions s ON u.id = s.user_id
    JOIN companies c ON s.corp_code = c.corp_code
    WHERE s.corp_code = @corp_code
      AND u.${sentimentCol} = 1
      AND ABS(@score) >= u.min_score
      AND (u.min_market_cap = 0 OR c.market_cap >= u.min_market_cap)
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = u.id AND n.rcept_no = @rcept_no
      )
      AND u.kakao_access_token IS NOT NULL
  `).all({ corp_code: disclosure.corp_code, score: disclosure.score, rcept_no: disclosure.rcept_no })
}

export function recordNotification(userId: number, rceptNo: string, status = 'sent'): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO notifications (user_id, rcept_no, status) VALUES (?, ?, ?)
  `).run(userId, rceptNo, status)
}
