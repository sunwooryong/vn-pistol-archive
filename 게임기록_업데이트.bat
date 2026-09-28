@echo off
chcp 949 >nul
title 게임사격기록 업데이트
cd /d "C:\Users\sunwo\vn-pistol-archive"

echo ============================================
echo   게임사격기록 - 아카이브 업데이트
echo ============================================
echo.
echo [1/4] 폴더의 PDF를 읽어 데이터 생성...
python game-etl.py
if errorlevel 1 (
  echo.
  echo [오류] python 실행 실패. Python이 설치되어 있는지 확인하세요.
  pause
  exit /b 1
)
echo.
echo [2/4] 변경사항 저장...
git add web/game.json
git -c user.name=RYONG -c user.email=sunwooryong@gmail.com commit -m "게임기록 업데이트" 2>nul
if errorlevel 1 echo   (새로 추가된 변경이 없습니다 - 이미 최신)

echo.
echo [3/4] 최신 동기화...
git pull --rebase origin main

echo.
echo [4/4] 사이트에 업로드...
git push origin main
if errorlevel 1 (
  echo.
  echo [오류] 업로드 실패. 인터넷 연결/깃 로그인을 확인하세요.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   완료! 1~2분 후 사이트 '게임' 탭에 반영됩니다.
echo   https://sunwooryong.github.io/vn-pistol-archive/
echo ============================================
echo.
pause
