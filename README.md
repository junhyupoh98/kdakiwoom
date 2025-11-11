# 주식 정보 챗봇

스마트폰용 주식 정보 검색 챗봇입니다. 한국 주식과 해외 주식을 검색할 수 있습니다.

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

## 환경 변수 (선택사항)

Python 서버는 다음 환경 변수를 지원합니다:

- `NAVER_CLIENT_ID`: 네이버 뉴스 API 클라이언트 ID
- `NAVER_CLIENT_SECRET`: 네이버 뉴스 API 클라이언트 시크릿
- `OPENAI_API_KEY`: OpenAI API 키 (뉴스 요약용, 현재는 사용 안 함)

API 키는 `backend/python/server.py` 파일에서 직접 설정할 수도 있습니다.

## 주의사항

- Python 서버는 DART API 키가 필요합니다 (한국 주식 재무제표 조회용)
- 캐시 파일은 `cache/` 디렉토리에 자동으로 생성됩니다
- `.gitignore`에 캐시 파일이 포함되어 있어 Git에 커밋되지 않습니다


