# 📁 프론트엔드 리팩토링 가이드

## 🏗️ 새로운 파일 구조

```
frontend/
├── js/
│   ├── modules/           # 모듈화된 JavaScript 파일들
│   │   ├── constants.js   # 상수 및 설정 (API URLs, 시장 매핑 등)
│   │   ├── utils.js       # 유틸리티 함수 (포맷팅, 정규화 등)
│   │   ├── api.js         # API 호출 함수들
│   │   ├── chart.js       # 차트 렌더링 (Chart.js)
│   │   ├── bingo.js       # 빙고 챌린지 기능
│   │   ├── camera.js      # 카메라/웹캠 기능
│   │   ├── favorite.js    # 관심종목 관리
│   │   └── trade.js       # 매매 모달 (데모)
│   └── script.js          # 메인 진입점 (⚠️ 아직 리팩토링 중)
├── css/
│   └── style.css
├── index.html             # HTML (type="module" 추가됨)
└── REFACTOR_GUIDE.md      # 이 파일
```

## ✅ 완료된 작업

1. **constants.js** - 모든 상수 및 설정 분리
   - API URLs (개발/배포 환경)
   - 시장 매핑 (MARKET_ALIAS_MAP, SUPPORTED_MARKETS)
   - 챗봇 응답 규칙
   - 빙고 기업 목록
   - 차트 색상 테마

2. **utils.js** - 유틸리티 함수 분리
   - 문자열 포맷팅 (escapeHtml, formatVisionValue)
   - 숫자 포맷팅 (formatNumber, formatNumberInHundredMillion)
   - 시장/티커 정규화 (normalizeMarketName, sanitizeTicker)
   - localStorage 관리 (관심종목)

3. **api.js** - 모든 API 호출 함수
   - 주가 정보 (fetchStockData, fetchChartData)
   - 뉴스/재무제표 (fetchStockNews, fetchStockFinancials)
   - AI/NLP (requestStockParse, requestFinanceQA)
   - Vision API (requestVisionAnalysis)
   - 시장 지수 (loadMarketIndices)

4. **chart.js** - 차트 렌더링 함수들
   - 메인 주가 차트 (renderChart) - 빨간색 테마
   - 사업부문별 매출 도넛 차트 (renderSegmentChart)
   - 재무제표 막대 차트 (renderFinancialChart)
   - 매매 모달 차트 (drawTradeChart)

5. **bingo.js** - 빙고 챌린지 기능
   - 빙고 상태 관리 (loadBingoState, saveBingoState)
   - UI 렌더링 (renderBingoGrid, updateBingoProgress)
   - 게임 로직 (completeCompany, checkBingoComplete)
   - 모달 관리 (openBingoModal, closeBingoModal)

6. **camera.js** - 카메라 기능
   - 카메라 모달 (openCameraModal, closeCameraModal)
   - 사진 캡처 (capturePhoto) - object-fit: cover 대응
   - 앨범 선택 (openAlbum)

7. **favorite.js** - 관심종목 관리
   - 관심종목 토글 (toggleFavorite)
   - 모달 렌더링 (renderFavoriteList)
   - localStorage 연동

8. **trade.js** - 매매 모달 (데모)
   - 증권앱 스타일 UI
   - Mock 차트 렌더링
   - 매수/매도 버튼 (데모)

9. **HTML 업데이트**
   - `<script type="module">` 추가

## ⚠️ 진행 중인 작업

### script.js 리팩토링 필요
현재 `frontend/js/script.js`는 아직 **5635줄**의 거대한 파일입니다.
다음 단계로 아래 작업이 필요합니다:

1. **UI 렌더링 함수들을 ui.js로 분리**
   - `addMessage()`, `addStockMessage()`
   - `addFinancialMessage()`, `addNewsMessage()`
   - `addVisionPrimaryMessage()` 등

2. **Vision 분석 로직을 vision.js로 분리**
   - `handleImageFile()`
   - `getVisionStockCandidate()`
   - 이미지 처리 관련 함수들

3. **script.js를 진입점으로 정리**
   - 모듈 import
   - DOM 초기화
   - 이벤트 리스너 등록만 남기기

## 🔧 사용 방법

### 개발 환경
```bash
# 백엔드 서버 실행 (Python)
cd backend/python
python server.py

# 프론트엔드 서버 실행 (또는 Live Server 사용)
# index.html을 열면 됨
```

### 모듈 Import 예시
```javascript
// constants.js에서 상수 가져오기
import { API_BASE_URL, MARKET_ALIAS_MAP } from './modules/constants.js';

// api.js에서 함수 가져오기
import { fetchStockData, requestVisionAnalysis } from './modules/api.js';

// chart.js에서 함수 가져오기
import { renderChart, renderSegmentChart } from './modules/chart.js';
```

## 📝 주의사항

1. **ES6 Modules 사용**
   - `type="module"` 필수
   - CORS 이슈 주의 (로컬 서버 필요)

2. **Import 순서**
   - constants.js가 가장 먼저
   - utils.js가 그 다음
   - 나머지는 의존성에 따라

3. **Global 변수**
   - 일부 함수는 아직 `window`에 노출 필요
   - 예: `window.handleImageFile`, `window.addMessage`

4. **벨류체인 API 주석 처리**
   - `backend/python/vision_bridge.py` 861-876번 줄
   - 속도 최적화를 위해 비활성화 (필요시 재활성화)

## 🎯 다음 단계

1. **ui.js 생성** - UI 렌더링 함수 분리 (가장 큰 작업)
2. **vision.js 생성** - 이미지 분석 로직 분리
3. **script.js 정리** - 진입점만 남기기
4. **불필요한 코드 제거** - 주석, 중복 코드 정리
5. **테스트** - 모든 기능 동작 확인

## 💡 팁

- **파일이 너무 크면**: 기능별로 더 세분화
- **모듈 찾기**: `grep`으로 함수명 검색
- **의존성 추적**: Import 체인 확인

## 📚 참고

- ES6 Modules: https://developer.mozilla.org/ko/docs/Web/JavaScript/Guide/Modules
- Chart.js: https://www.chartjs.org/
- Vision API: Google Cloud Vision API

