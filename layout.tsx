import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { startScheduler } from '@/lib/poller'

const inter = Inter({ subsets: ['latin'] })

// 서버 시작 시 스케줄러 시작
if (typeof window === 'undefined') {
  startScheduler()
}

export const metadata: Metadata = {
  title: 'JJIRASI | AI 전자공시 분석',
  description: 'DART 전자공시를 AI가 실시간 분석 — 호재/악재를 1분 안에 카카오톡으로 알려드립니다',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
