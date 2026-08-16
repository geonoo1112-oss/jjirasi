/**
 * 전체 기업 목록 반환 (검색 자동완성용)
 */
import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

export async function GET() {
  const url = process.env.DATABASE_URL
  if (!url) return NextResponse.json({ companies: [] })

  try {
    const sql = neon(url)
    const rows = await sql`
      SELECT corp_code, corp_name, stock_code, market
      FROM companies
      WHERE stock_code IS NOT NULL AND stock_code != ''
      ORDER BY market_cap DESC NULLS LAST, corp_name ASC
    `
    return NextResponse.json({ companies: rows })
  } catch {
    return NextResponse.json({ companies: [] })
  }
}
