@echo off
echo Streamlit 설치 중...
pip install --only-binary :all: streamlit
if %errorlevel% neq 0 (
    echo.
    echo 미리 빌드된 wheel이 없어서 일반 설치를 시도합니다...
    pip install streamlit
)
echo.
echo 설치 완료!
pause




