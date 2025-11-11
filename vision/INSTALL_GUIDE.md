# Streamlit 설치 가이드

Windows에서 Python 3.14를 사용하는 경우 pyarrow 빌드 오류가 발생할 수 있습니다.

## 해결 방법

### 방법 1: 미리 빌드된 wheel 사용 (권장)

```bash
pip install --only-binary :all: streamlit
```

### 방법 2: 일반 설치

```bash
pip install streamlit
```

빌드 오류가 발생하면 다음을 시도하세요:

### 방법 3: 개별 패키지 설치

```bash
# 먼저 pyarrow를 별도로 설치
pip install pyarrow

# 그 다음 streamlit 설치
pip install streamlit
```

### 방법 4: Visual Studio Build Tools 설치

pyarrow 빌드에 필요한 도구:
1. [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) 다운로드
2. "C++ build tools" 워크로드 설치
3. CMake 설치 (선택사항)

### 방법 5: Conda 사용 (가장 안정적)

```bash
conda install -c conda-forge streamlit
```

## 빠른 설치 스크립트

`install_streamlit.bat` 파일을 실행하세요.




