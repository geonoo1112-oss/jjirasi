import { NextResponse } from 'next/server'
import { importCompaniesSimple, updateMarketCapData } from '@/lib/companies'
import { getStats } from '@/lib/db'

// 전체 기업 목록 임포트 (최초 1회 실행)
export async function POST() {
  try {
    console.log('[Import] 전체 기업 코드 임포트 시작...')
    const count = await importCompaniesSimple()

    // 시가총액 업데이트 (별도로 시도)
    updateMarketCapData().catch(e => console.warn('[Import] 시가총액 업데이트 실패:', e))

    const stats = getStats()
    return NextResponse.json({
      success: true,
      message: `${count}개 기업 등록 완료`,
      companyCount: stats.companyCount,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
