import { NextRequest, NextResponse } from 'next/server'
import { queryDisclosures, getStats } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const sentiment = searchParams.get('sentiment') as any || 'all'
  const corpCode = searchParams.get('corp_code') || undefined
  const search = searchParams.get('search') || undefined
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const dateFrom = searchParams.get('date_from') || undefined
  const dateTo = searchParams.get('date_to') || undefined

  try {
    const disclosures = queryDisclosures({ sentiment, corpCode, search, limit, offset, dateFrom, dateTo })
    const stats = getStats()

    return NextResponse.json({ disclosures, stats })
  } catch (error) {
    console.error('공시 조회 오류:', error)
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 })
  }
}
