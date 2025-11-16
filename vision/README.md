# Google Cloud Vision 이미지 인식 프로젝트

Google Cloud Vision API를 사용하여 이미지에서 정보를 인식하고 추출하는 프로젝트입니다.

## 기능

- 📸 **이미지 분석**: 라벨, 텍스트, 얼굴, 랜드마크 자동 인식
- 📝 **텍스트 추출 (OCR)**: 이미지에서 텍스트 인식 및 추출
- 🔍 **객체 감지**: 이미지 내 객체 위치 및 종류 감지
- 😊 **얼굴 감지**: 얼굴 감지 및 감정 분석
- 🏢 **로고 인식**: 브랜드 로고 자동 인식
- 🗺️ **랜드마크 인식**: 유명 랜드마크 자동 인식
- 🛡️ **안전 필터링**: 성인 콘텐츠, 폭력 등 안전 검사

## 사전 요구사항

1. **Google Cloud 계정**: Google Cloud Platform 계정이 필요합니다
2. **프로젝트 생성**: GCP에서 프로젝트를 생성해야 합니다
3. **Vision API 활성화**: Cloud Vision API를 활성화해야 합니다
4. **서비스 계정 키**: 서비스 계정 키 파일이 필요합니다
5. **Python 3.7 이상**

## 설정 방법

### 1. Google Cloud 프로젝트 설정

#### 1-1. 프로젝트 생성
1. [Google Cloud Console](https://console.cloud.google.com)에 로그인
2. 상단 프로젝트 선택 메뉴에서 **"새 프로젝트"** 클릭
3. 프로젝트 이름 입력 (예: `vision-project`)
4. **"만들기"** 클릭

#### 1-2. Cloud Vision API 활성화
1. 왼쪽 메뉴에서 **"API 및 서비스"** → **"라이브러리"** 클릭
2. 검색창에 **"Cloud Vision API"** 입력
3. **"Cloud Vision API"** 선택
4. **"사용 설정"** 클릭

#### 1-3. 서비스 계정 키 생성
1. 왼쪽 메뉴에서 **"API 및 서비스"** → **"사용자 인증 정보"** 클릭
2. 상단 **"사용자 인증 정보 만들기"** → **"서비스 계정"** 선택
3. 서비스 계정 정보 입력:
   - **서비스 계정 이름**: 원하는 이름 (예: `vision-service`)
   - **서비스 계정 ID**: 자동 생성됨
   - **설명**: (선택사항)
4. **"만들기 및 계속"** 클릭
5. 역할 선택: **"Cloud Vision API 사용자"** 또는 **"편집자"** 선택
6. **"계속"** → **"완료"** 클릭
7. 생성된 서비스 계정 클릭
8. **"키"** 탭 → **"키 추가"** → **"새 키 만들기"** 선택
9. 키 유형: **JSON** 선택
10. **"만들기"** 클릭 → JSON 파일이 자동으로 다운로드됨
11. 다운로드한 JSON 파일을 프로젝트 폴더에 저장 (예: `service-account-key.json`)

### 2. 프로젝트 설정

```bash
# 의존성 패키지 설치
pip install -r requirements.txt

# 환경 변수 파일 생성
# .env 파일을 만들고 아래 내용 추가:
# GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
```

**또는 환경 변수로 직접 설정:**
```bash
# Windows (PowerShell)
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account-key.json"

# Windows (CMD)
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account-key.json

# Linux/Mac
export GOOGLE_APPLICATION_CREDENTIALS="./service-account-key.json"
```

## 사용 방법

### 방법 1: 웹 애플리케이션 (권장) 🌐

파일 탐색기를 통해 이미지를 직접 선택하고 분석할 수 있는 웹 인터페이스를 제공합니다.

```bash
# Streamlit 설치 (처음 한 번만)
pip install streamlit

# 웹 앱 실행
streamlit run app.py
```

실행 후:
1. 브라우저가 자동으로 열립니다 (보통 `http://localhost:8501`)
2. 왼쪽 사이드바에서 분석 옵션 선택
3. 이미지 파일을 드래그 앤 드롭하거나 "Browse files" 버튼 클릭
4. "분석 시작" 버튼 클릭
5. 결과 확인

### 방법 2: 명령줄 인터페이스 💻

```bash
python google_vision.py
```

실행 후:
1. 분석할 이미지 파일 경로 입력
2. 원하는 분석 유형 선택:
   - `1`: 전체 분석 (라벨, 텍스트, 객체, 얼굴 등)
   - `2`: 텍스트 추출 (OCR)
   - `3`: 객체 감지
   - `4`: 얼굴 감지
   - `5`: 모든 분석 수행

## 예제

### 이미지 분석 결과 예시

```
📊 이미지 분석 결과
==================================================

🏷️  라벨:
   • Person (95.23%)
   • Face (92.15%)
   • Clothing (88.45%)

📝 감지된 텍스트:
   안녕하세요
   Google Cloud Vision

😊 얼굴: 1개 감지

🎯 객체:
   • Person (0.95)

🛡️  안전 필터:
   성인 콘텐츠: VERY_UNLIKELY
   폭력: VERY_UNLIKELY
   선정적: VERY_UNLIKELY
==================================================
```

### 텍스트 추출 결과 예시

```
📝 추출된 텍스트
==================================================
안녕하세요
Google Cloud Vision
텍스트 인식 테스트
OCR 기능 테스트
==================================================
```

### 얼굴 감지 결과 예시

```
😊 감지된 얼굴
==================================================

  얼굴 1:
    기쁨: VERY_LIKELY
    슬픔: VERY_UNLIKELY
    분노: VERY_UNLIKELY
    놀람: VERY_UNLIKELY
    감지 신뢰도: 98.50%
==================================================
```

## 지원되는 이미지 형식

- JPEG
- PNG
- GIF
- BMP
- WebP
- RAW
- ICO

## 가격 정보

Google Cloud Vision API는 **무료 할당량**을 제공합니다:
- **월 1,000회 무료** (이미지당 1회 호출 기준)
- 그 이후: 이미지당 약 $1.50 (기능에 따라 다름)

자세한 가격 정보: [Cloud Vision 가격](https://cloud.google.com/vision/pricing)

## 제한 사항

- 이미지 크기: **20MB 이하**
- 최소 이미지 크기: 4x4 픽셀
- 최대 이미지 크기: 75 메가픽셀 (약 10,000x7,500 픽셀)
- 지원되는 언어: 100개 이상의 언어

## 문제 해결

### 인증 오류
- 서비스 계정 키 파일 경로가 올바른지 확인하세요
- `GOOGLE_APPLICATION_CREDENTIALS` 환경 변수가 올바르게 설정되었는지 확인하세요
- 서비스 계정에 Cloud Vision API 사용 권한이 있는지 확인하세요

### API 활성화 오류
- Google Cloud Console에서 Cloud Vision API가 활성화되어 있는지 확인하세요
- 프로젝트가 올바르게 선택되어 있는지 확인하세요

### 이미지 로드 오류
- 이미지 파일 경로가 올바른지 확인하세요
- 이미지 파일이 손상되지 않았는지 확인하세요
- 지원되는 이미지 형식인지 확인하세요
- 이미지 크기가 제한을 초과하지 않는지 확인하세요

### 할당량 초과 오류
- 무료 할당량(월 1,000회)을 초과했을 수 있습니다
- Google Cloud Console에서 할당량 사용량을 확인하세요
- 결제 계정을 연결하면 더 많은 요청이 가능합니다

## 참고 자료

- [Google Cloud Vision API 문서](https://cloud.google.com/vision/docs)
- [Python 클라이언트 라이브러리](https://googleapis.dev/python/vision/latest/index.html)
- [API 참조](https://cloud.google.com/vision/docs/reference/rest)

## 라이선스

이 프로젝트는 예제 목적으로 제공됩니다.
