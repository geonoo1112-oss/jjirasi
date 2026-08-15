import { NextRequest, NextResponse } from 'next/server'
import { analyzeAllPending } from '@/lib/poller'
import { updateAnalysis, queryDisclosures } from '@/lib/db'
import { analyzeDisclosure } from '@/lib/analyzer'

// 특정 공시 재분석 또는 전체 미분석 공시 분석
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const rceptNo = body.rcept_no

    if (rceptNo) {
      // 특정 공시 재분석
      const disclosures = await queryDisclosures({ limit: 1 })
      const target = disclosures.find(d => d.rcept_no === rceptNo)

      if (!target) {
        return NextResponse.json({ error: '공시를 찾을 수 없습니다' }, { status: 404 })
      }

      const result = await analyzeDisclosure({
        corpName: target.corp_name,
        reportNm: target.report_nm,
        rceptDt: target.rcept_dt,
        corpCls: 'Y',
        fullText: target.full_text,
      })

      await updateAnalysis(rceptNo, result)
      return NextResponse.json({ success: true, analysis: result })
    }

    // 전체 미분석 공시 분석
    const analyzed = await analyzeAllPending()
    return NextResponse.json({ success: true, analyzed })

  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
