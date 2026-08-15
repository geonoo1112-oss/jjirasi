import { NextRequest, NextResponse } from 'next/server'
import { searchCompanies, getCompaniesByMarketCap } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''
  const minCap = parseFloat(searchParams.get('min_cap') || '0')

  try {
    let companies
    if (query) {
      companies = searchCompanies(query, 20)
    } else {
      companies = getCompaniesByMarketCap(minCap, 100)
    }
    return NextResponse.json({ companies })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
