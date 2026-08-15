# 📰 JJIRASI — AI 전자공시 분석

DART(금융감독원 전자공시시스템)에서 새 공시가 올라오면 Claude AI가 자동으로 분석하여 **호재/악재** 여부와 점수를 알려주는 웹사이트입니다.

## 주요 기능

- ✅ DART API로 최신 공시 자동 수집 (기본 5분마다)
- 🤖 Claude AI로 호재/악재/중립 자동 분석
- 📈 -100 ~ +100 점수로 영향도 수치화
- 🔍 기업명/공시명 검색 & 필터
- 📊 오늘 통계 (호재/악재/대기 건수)
- 🔗 DART 원문 바로가기

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열어서 API 키를 입력하세요:

```env
DART_API_KEY=여기에_DART_API키_입력
ANTHROPIC_API_KEY=여기에_Claude_API키_입력
POLL_INTERVAL_MINUTES=5
```

**DART API 키 발급:** https://dart.fss.or.kr → 로그인 → 마이페이지 → Open API 이용 신청

**Claude API 키 발급:** https://console.anthropic.com → API Keys → Create Key

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 열기

### 4. 프로덕션 배포

```bash
npm run build
npm start
```

## 폴더 구조

```
dart-analyzer/
├── app/
│   ├── page.tsx              # 메인 대시보드
│   ├── layout.tsx            # 레이아웃 + 스케줄러 시작
│   ├── globals.css
│   └── api/
│       ├── disclosures/      # 공시 목록 조회 API
│       ├── trigger-poll/     # 수동 수집 트리거
│       └── analyze/          # AI 분석 트리거
├── lib/
│   ├── dart.ts              # DART API 연동
│   ├── analyzer.ts          # Claude AI 분석
│   ├── db.ts                # SQLite 데이터베이스
│   └── poller.ts            # 폴링 + 분석 파이프라인
├── types/
│   └── index.ts             # TypeScript 타입 정의
└── data/
    └── dart.db              # SQLite DB (자동 생성)
```

## 사용법

1. 서버 실행 후 http://localhost:3000 접속
2. **"지금 수집"** 버튼 → DART에서 오늘 공시 즉시 가져오기
3. AI 분석은 자동으로 진행 (보통 건당 5~10초 소요)
4. 페이지는 1분마다 자동 갱신

## 주의사항

- 본 분석은 참고용이며 투자 결정의 근거로 사용하지 마세요
- DART API는 하루 10,000회 호출 제한이 있습니다
- Claude API 비용: 공시 분석 1건당 약 $0.001~0.003
