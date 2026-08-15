/**
 * 전체 코스피/코스닥 기업 등록 모듈
 * DART API에서 전체 상장사 목록을 가져와 DB에 저장
 * KRX에서 시가총액 데이터도 가져옴
 */

import axios from 'axios'
import { parseStringPromise } from 'xml2js'
import { upsertCompany, updateMarketCap } from './db'

/**
 * DART API에서 전체 기업 코드 목록 다운로드
 * ZIP 파일로 제공되므로 별도 파싱 필요
 */
export async function importAllCompanies(): Promise<number> {
  const apiKey = process.env.DART_API_KEY
  if (!apiKey) throw new Error('DART_API_KEY 없음')

  console.log('[Companies] DART에서 전체 기업 코드 다운로드 중...')

  try {
    // DART 기업코드 전체 다운로드 (ZIP)
    const response = await axios.get('https://opendart.fss.or.kr/api/corpCode.xml', {
      params: { crtfc_key: apiKey },
      responseType: 'arraybuffer',
    })

    // ZIP 파일 처리
    const AdmZip = (await import('adm-zip')).default
    const zip = new AdmZip(Buffer.from(response.data))
    const xmlEntry = zip.getEntry('CORPCODE.xml')
    if (!xmlEntry) throw new Error('CORPCODE.xml을 찾을 수 없음')

    const xmlContent = xmlEntry.getData().toString('utf-8')
    const parsed = await parseStringPromise(xmlContent)
    const corps = parsed.result.list

    let count = 0
    for (const corp of corps) {
      const stockCode = corp.stock_code?.[0]?.trim()
      // 상장된 기업만 (stock_code가 있는 기업)
      if (!stockCode) continue

      upsertCompany({
        corp_code: corp.corp_code[0],
        corp_name: corp.corp_name[0],
        stock_code: stockCode,
        market: 'OTHER', // 시장 구분은 KRX에서 별도로 가져옴
      })
      count++
    }

    console.log(`[Companies] ${count}개 상장 기업 등록 완료`)
    return count

  } catch (error) {
    console.error('[Companies] DART 기업코드 가져오기 실패:', error)
    throw error
  }
}

/**
 * KRX에서 시가총액 + 시장 구분(코스피/코스닥) 데이터 가져오기
 * KRX 데이터포털 API 사용
 */
export async function updateMarketCapData(): Promise<void> {
  console.log('[Companies] KRX 시가총액 데이터 업데이트 중...')

  try {
    // 코스피 시가총액
    await fetchKrxMarketData('STK') // 유가증권(코스피)
    // 코스닥 시가총액
    await fetchKrxMarketData('KSQ') // 코스닥
    console.log('[Companies] 시가총액 업데이트 완료')
  } catch (error) {
    console.error('[Companies] 시가총액 업데이트 실패:', error)
  }
}

async function fetchKrxMarketData(marketCode: 'STK' | 'KSQ'): Promise<void> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const marketName = marketCode === 'STK' ? 'KOSPI' : 'KOSDAQ'

  try {
    // KRX 정보데이터시스템 OTP 발급
    const otpRes = await axios.post(
      'http://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd',
      new URLSearchParams({
        locale: 'ko_KR',
        mktId: marketCode,
        trdDd: today,
        money: '1',
        csvxls_isNo: 'false',
        name: 'fileDown',
        url: 'dbms/MDC/STAT/standard/MDCSTAT01501',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'http://data.krx.co.kr' } }
    )

    const otp = otpRes.data

    // OTP로 데이터 다운로드
    const dataRes = await axios.post(
      'http://data.krx.co.kr/comm/fileDn/download_csv/download.cmd',
      new URLSearchParams({ code: otp }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'http://data.krx.co.kr' },
        responseType: 'arraybuffer',
      }
    )

    // CSV 파싱 (EUC-KR 인코딩)
    const iconv = (await import('iconv-lite')).default
    const csvText = iconv.decode(Buffer.from(dataRes.data), 'euc-kr')
    const lines = csvText.split('\n').slice(1) // 헤더 제외

    for (const line of lines) {
      const cols = line.split(',')
      if (cols.length < 5) continue

      const stockCode = cols[0]?.trim().replace(/"/g, '')
      const corpName = cols[1]?.trim().replace(/"/g, '')
      const marketCapStr = cols[4]?.trim().replace(/"/g, '').replace(/,/g, '')
      const marketCap = parseFloat(marketCapStr) / 100000000 // 원 → 억원

      if (!stockCode || !marketCap) continue

      // stock_code로 기업 찾아서 시가총액 + 시장 업데이트
      const { getDb } = await import('./db')
      // @ts-ignore
      const db = (getDb as any)()
      const company = db.prepare('SELECT corp_code FROM companies WHERE stock_code = ?').get(stockCode)
      if (company) {
        db.prepare('UPDATE companies SET market_cap = ?, market = ? WHERE corp_code = ?')
          .run(marketCap, marketName, company.corp_code)
      }
    }

    console.log(`[Companies] ${marketName} 시가총액 업데이트 완료`)

  } catch (error) {
    console.warn(`[Companies] ${marketName} KRX 데이터 가져오기 실패 (수동 업데이트 필요):`, error)
  }
}

/**
 * 간단한 기업 등록 (DART API만으로, 시가총액 없이)
 * KRX API가 막힌 경우 대안
 */
export async function importCompaniesSimple(): Promise<number> {
  // adm-zip이 없으면 설치
  try {
    await import('adm-zip')
  } catch {
    const { execSync } = await import('child_process')
    execSync('npm install adm-zip iconv-lite', { stdio: 'inherit' })
  }
  return importAllCompanies()
}
