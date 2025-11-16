# 📦 배포 가이드

## 🎯 배포 아키텍처

```
Frontend (Vercel - 무료)
    ↓ API 요청
Backend Python (Render - 무료)
    ↓ 외부 API 호출
ChromaDB, OpenAI, Gemini, Vision API 등
```

---

## 🚀 1단계: GitHub 준비

### 1-1. Git 초기화 (아직 안 했다면)

```bash
git init
git add .
git commit -m "Initial commit"
```

### 1-2. GitHub 레포지토리 생성 및 푸시

1. GitHub.com → 새 레포지토리 생성 (Public)
2. 터미널에서 실행:

```bash
git remote add origin https://github.com/your-username/your-repo-name.git
git branch -M main
git push -u origin main
```

⚠️ **중요**: `.env` 파일과 `*.json` (API 키 파일)은 푸시되지 않습니다 (`.gitignore`에 포함됨)

---

## 🐍 2단계: Python Backend 배포 (Render)

### 2-1. Render 가입
- https://render.com/ 접속
- GitHub 계정으로 가입

### 2-2. 새 Web Service 생성
1. Dashboard → **"New +"** → **"Web Service"**
2. GitHub 레포지토리 연결
3. 설정:
   - **Name**: `stock-chatbot-api` (원하는 이름)
   - **Region**: Oregon (무료)
   - **Branch**: `main`
   - **Root Directory**: 비워두기
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python backend/python/server.py`
   - **Plan**: **Free**

### 2-3. 환경 변수 설정

"Environment" 탭에서 다음 환경 변수 추가:

```
PORT=10000
FLASK_ENV=production

# Google Vision API
GOOGLE_SERVICE_ACCOUNT_JSON=여기에_service-account.json_파일_내용_전체_복사

# Gemini API
GEMINI_API_KEY=AIzaSyCg_cFR00LmfU2lUx5RuqOEm8lH26bvO88

# OpenAI API
OPENAI_API_KEY=sk-proj-...

# ChromaDB
CHROMADB_API_KEY=ck-BGYLZPX4So3TCKT9MLwvDB3GSdbGJzgv4eM4Lpca9f8s
CHROMADB_TENANT=2f8c70eb-2e37-4645-bdf7-676a3324e684
CHROMADB_DATABASE=project_pic
CHROMADB_US_FIN_COLLECTION=USfund_charts

# 한국 API (선택)
FMP_API_KEY=your_fmp_key
DART_API_KEY=your_dart_key
NAVER_CLIENT_ID=your_naver_id
NAVER_CLIENT_SECRET=your_naver_secret
```

#### 📌 `GOOGLE_SERVICE_ACCOUNT_JSON` 설정 방법:

1. `backend/credentials/service-account.json` 파일 열기
2. **전체 내용**을 복사 (중괄호부터 끝까지 모든 줄)
3. Render 환경 변수에 붙여넣기
4. **한 줄로** 만들어야 함 (줄바꿈 제거)

   또는 이렇게 처리:
   ```bash
   # Mac/Linux
   cat backend/credentials/service-account.json | tr -d '\n'
   
   # Windows PowerShell
   (Get-Content backend/credentials/service-account.json -Raw) -replace '\r?\n', ''
   ```

### 2-4. 배포
- **"Create Web Service"** 클릭
- 자동 빌드 시작 (5-10분 소요)
- 완료되면 URL 확인 (예: `https://stock-chatbot-api.onrender.com`)

---

## 🌐 3단계: Frontend 배포 (Vercel)

### 3-1. Vercel 가입
- https://vercel.com/ 접속
- GitHub 계정으로 가입

### 3-2. 프로젝트 배포
1. Dashboard → **"Add New..." → "Project"**
2. GitHub 레포지토리 선택
3. 설정:
   - **Framework Preset**: `Other` (정적 사이트)
   - **Root Directory**: `frontend`
   - **Build Command**: 비워두기 (정적 파일)
   - **Output Directory**: `.` (현재 디렉토리)

### 3-3. `vercel.json` 수정
배포된 Python 백엔드 URL을 업데이트:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-RENDER-URL.onrender.com/api/:path*"
    }
  ]
}
```

`YOUR-RENDER-URL`을 실제 Render URL로 변경하고 GitHub에 푸시:

```bash
git add vercel.json
git commit -m "Update API URL"
git push
```

Vercel이 자동으로 재배포됩니다.

---

## ✅ 4단계: 테스트

### 4-1. Backend 테스트
```bash
curl https://your-render-url.onrender.com/health
# 응답: {"status":"ok"}
```

### 4-2. Frontend 테스트
1. Vercel URL 접속 (예: `https://your-app.vercel.app`)
2. 모바일에서도 테스트

---

## 🔧 문제 해결

### Render 배포 실패
- **Logs** 탭에서 에러 확인
- Python 버전 확인: `requirements.txt`에 버전 명시
- 환경 변수 누락 확인

### Vercel API 연결 안 됨
- `vercel.json`의 URL이 정확한지 확인
- Render 서버가 실행 중인지 확인 (무료 플랜은 15분 비활성화 시 sleep)
- 브라우저 개발자 도구 → Network 탭에서 API 요청 확인

### CORS 오류
- `backend/python/server.py`에서 CORS 설정 확인
- `flask-cors` 설치 확인

---

## 💰 비용

- **Vercel**: 무료 (월 100GB 대역폭)
- **Render**: 무료 (750시간/월, 15분 비활성화 시 sleep)

**총 비용: $0/월** ✨

---

## 🎉 완료!

이제 스마트폰에서 Vercel URL로 접속하면 작동합니다!

배포 URL 예시:
- Frontend: `https://your-app.vercel.app`
- Backend: `https://stock-chatbot-api.onrender.com`

---

## 📱 모바일 홈 화면 추가

### iPhone
1. Safari에서 Vercel URL 접속
2. 공유 버튼 → "홈 화면에 추가"

### Android
1. Chrome에서 Vercel URL 접속
2. 메뉴 → "홈 화면에 추가"

이제 앱처럼 사용 가능! 🎊

