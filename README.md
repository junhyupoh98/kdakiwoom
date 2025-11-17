# 📱 PicMe - 이미지 기반 주식 분석 챗봇

사진 한 장으로 투자 종목을 찾는 AI 기반 주식 정보 검색 챗봇입니다.

## ✨ 주요 기능

- 📸 **이미지 분석**: 제품/브랜드 사진을 찍으면 자동으로 관련 상장 기업 찾기
- 📊 **실시간 주가**: 한국/해외 주식 실시간 가격 및 차트
- 📰 **뉴스 분석**: 최신 뉴스 및 Earnings Call 요약
- 💼 **재무 분석**: 분기별 재무제표, 사업부문별 매출 분석
- 🔗 **관련 종목**: 피어그룹, 밸류체인 분석
- 🎥 **카메라 연동**: 웹캠/스마트폰 카메라로 직접 촬영

## 프로젝트 구조

```
kdafinal/
├── frontend/              # 프론트엔드 파일
│   ├── index.html        # 메인 HTML
│   ├── js/
│   │   └── script.js     # 클라이언트 JavaScript
│   └── css/
│       └── style.css    # 스타일시트
├── backend/              # 백엔드 서버
│   ├── node/
│   │   └── server.js     # Node.js Express 서버 (API Gateway)
│   └── python/
│       └── server.py     # Python Flask 서버 (한국 주식, 뉴스, 재무제표)
├── cache/                # 캐시 파일 (자동 생성)
│   └── dart_corpcode_cache.zip
├── package.json          # Node.js 의존성
├── requirements.txt      # Python 의존성
└── README.md
```

## 기능

- 한국 주식 검색 (회사명으로 검색 가능)
- 해외 주식 검색 (심볼 코드로 검색)
- 실시간 주가 정보 표시
- 주가 차트 그래프 (최근 1개월)
- 재무제표 조회 (분기별 매출액, 영업이익, 당기순이익)
- 사업 부문별 매출 분석 (파이 차트)
- 최신 뉴스 조회 (네이버 뉴스 API, FMP API)

## 설치 및 실행

### 1. Node.js 서버 설치 및 실행

```bash
# 의존성 설치
npm install

# 서버 실행
npm start

# 개발 모드 (자동 재시작)
npm run dev
```

서버는 `http://localhost:3000`에서 실행됩니다.

### 2. Python 서버 설치 및 실행

```bash
# 의존성 설치
pip install -r requirements.txt

# 서버 실행
python backend/python/server.py

# 또는 npm 스크립트 사용
npm run python
```

서버는 `http://localhost:5000`에서 실행됩니다.

### 3. 프론트엔드 접속

두 서버를 모두 실행한 후 브라우저에서 `http://localhost:3000`에 접속하면 됩니다.

## 사용법

- 한국 주식: "삼성전자", "트랜스오션", "에스비비테크" 등 회사명 입력
- 해외 주식: "AAPL", "MSFT", "GOOGL", "애플", "엔비디아" 등 심볼 코드 또는 회사명 입력
- 여러 종목 동시 검색: "삼성전자, 에스비비테크, 애플" (쉼표로 구분)

### 주요 기능 버튼

- **재무제표**: 분기별 재무제표 차트 및 사업 부문별 매출 분석
- **뉴스**: 최신 뉴스 기사 목록 (스크롤 가능)

## 기술 스택

- **프론트엔드**: HTML, CSS, JavaScript, Chart.js
- **백엔드**: 
  - Node.js + Express (API Gateway, 해외 주식)
  - Python + Flask (한국 주식, 뉴스, 재무제표)
- **주가 API**: 
  - FinanceDataReader (한국 주식)
  - Yahoo Finance (해외 주식)
- **재무제표 API**:
  - DART API (한국 주식)
  - FMP API (해외 주식, 세그먼트 분석)
- **뉴스 API**:
  - 네이버 뉴스 API (한국 주식)
  - FMP API (해외 주식)

## 🔑 환경 설정 (필수!)

### 1. `.env` 파일 생성

프로젝트 클론 후 **반드시** 환경 변수를 설정해야 합니다.

```bash
# 1. 예제 파일 복사
cp backend/.env.example backend/.env

# 2. backend/.env 파일을 열어서 실제 API 키로 변경
```

### 2. Google Service Account 설정

이미지 분석을 위해 Google Cloud Vision API 인증이 필요합니다.

```bash
# 1. backend/credentials/ 폴더 생성
mkdir -p backend/credentials

# 2. Google Cloud Console에서 다운로드한 service-account.json 파일을
#    backend/credentials/ 폴더에 저장
cp /path/to/your/service-account.json backend/credentials/

# 3. backend/.env 파일에서 경로 확인
# GOOGLE_APPLICATION_CREDENTIALS=./backend/credentials/service-account.json
```

### 3. 필수 API 키 목록

| API | 용도 | 필수 여부 | 발급 방법 |
|-----|------|-----------|-----------|
| **Google Cloud Vision** | 이미지 분석 | ✅ 필수 | [Google Cloud Console](https://console.cloud.google.com) |
| **Gemini API** | AI 분석 | ✅ 필수 | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| **ChromaDB** | 재무 데이터 | ✅ 필수 | 팀에서 공유 |
| OpenAI API | 텍스트 분석 | ⚠️ 선택 | [OpenAI Platform](https://platform.openai.com) |
| FMP API | 해외 주식 재무 | ⚠️ 선택 | [FMP](https://site.financialmodelingprep.com) |
| DART API | 한국 주식 재무 | ⚠️ 선택 | [DART](https://opendart.fss.or.kr) |
| Naver News API | 한국 뉴스 | ⚠️ 선택 | [Naver Developers](https://developers.naver.com) |

### 4. 환경 변수 예시

```bash
# backend/.env 파일 내용 예시
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GEMINI_API_KEY=AIzaSy...
CHROMADB_API_KEY=ck-...
# ... 기타 설정은 .env.example 참고
```

## ⚠️ 주의사항

### 보안
- ❌ **절대로** `.env` 파일이나 `service-account.json`을 Git에 커밋하지 마세요!
- ✅ `.gitignore`에 이미 포함되어 있어 자동으로 제외됩니다
- ✅ API 키는 절대 코드에 하드코딩하지 마세요

### 파일 구조
```
backend/
├── .env                          # ❌ Git에 커밋 안 됨 (민감 정보)
├── .env.example                  # ✅ Git에 포함 (예제)
└── credentials/
    └── service-account.json      # ❌ Git에 커밋 안 됨 (민감 정보)
```


