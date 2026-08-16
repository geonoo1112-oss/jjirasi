/**
 * DART 전체 기업 코드 가져오기
 * DART API → corpCode.xml (ZIP) → 상장기업만 필터 → companies 테이블 저장
 */
import { NextResponse } from 'next/server'
import axios from 'axios'
import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'
import { neon } from '@neondatabase/serverless'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 없음')
  return neon(url)
}

export async function POST() {
  const apiKey = process.env.DART_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DART_API_KEY 없음' }, { status: 500 })

  try {
    // 1. DART에서 전체 기업코드 ZIP 다운로드
    const response = await axios.get('https://opendart.fss.or.kr/api/corpCode.xml', {
      params: { crtfc_key: apiKey },
      responseType: 'arraybuffer',
      timeout: 60000,
    })

    // 2. ZIP에서 CORPCODE.xml 추출
    const zip = new AdmZip(Buffer.from(response.data))
    const xmlEntry = zip.getEntry('CORPCODE.xml')
    if (!xmlEntry) throw new Error('CORPCODE.xml 파일을 찾을 수 없습니다')

    const xmlContent = xmlEntry.getData().toString('utf8')

    // 3. XML 파싱
    const parsed = await parseStringPromise(xmlContent, { explicitArray: false })
    const all: any[] = parsed.result.list

    if (!Array.isArray(all)) throw new Error('기업 목록 파싱 실패')

    // 4. 상장기업만 필터 (stock_code가 있는 것)
    const listed = all.filter(c =>
      c.stock_code && c.stock_code.trim() !== '' && c.stock_code.trim() !== ' '
    )

    // 5. companies 테이블에 일괄 저장 (100개씩 배치)
    const sql = getSql()
    let saved = 0

    for (let i = 0; i < listed.length; i += 100) {
      const batch = listed.slice(i, i + 100)
      await Promise.all(
        batch.map(c =>
          sql`
            INSERT INTO companies (corp_code, corp_name, stock_code)
            VALUES (${c.corp_code.trim()}, ${c.corp_name.trim()}, ${c.stock_code.trim()})
            ON CONFLICT (corp_code) DO UPDATE SET
              corp_name = EXCLUDED.corp_name,
              stock_code = EXCLUDED.stock_code,
              updated_at = NOW()
          `.catch(() => null)
        )
      )
      saved += batch.length
    }

    return NextResponse.json({
      success: true,
      total: all.length,
      listed: listed.length,
      saved,
      message: `코스피·코스닥 상장기업 ${listed.length}개 저장 완료`,
    })
  } catch (error) {
    console.error('[BulkImport]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
