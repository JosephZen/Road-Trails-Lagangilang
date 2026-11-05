@echo off
setlocal enabledelayedexpansion

echo ====================================================
echo  Road ^& Trails Lagangilang - Git Push Assistant
echo ====================================================

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set CURRENT_BRANCH=%%i
if "%CURRENT_BRANCH%"=="" set CURRENT_BRANCH=main

echo Current Git Branch: %CURRENT_BRANCH%
echo Running build verification...

call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed! Aborting push.
    pause
    exit /b 1
)

echo.
echo Staging changes...
git add -A

set "COMMIT_MSG=%~1"
if "%COMMIT_MSG%"=="" (
    set /p "COMMIT_MSG=Enter commit message (Press Enter for default): "
)
if "%COMMIT_MSG%"=="" (
    set "COMMIT_MSG=Update: routing navigation, emergency hotlines and offline map fixes"
)

echo Committing: "%COMMIT_MSG%"
git commit -m "%COMMIT_MSG%"

echo.
echo Pushing to origin/%CURRENT_BRANCH%...
git push origin %CURRENT_BRANCH%

if %errorlevel% equ 0 (
    echo.
    echo ====================================================
    echo  Successfully pushed to GitHub!
    echo ====================================================
) else (
    echo.
    echo [ERROR] Push failed. Check your GitHub authentication or network.
)

pause
