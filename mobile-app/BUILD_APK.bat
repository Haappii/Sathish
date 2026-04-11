@echo off
echo ============================================================
echo   Haappii Billing - Build APK using EAS Cloud Build
echo ============================================================
echo.
echo Step 1: Login to your Expo account
echo   (Create a FREE account at https://expo.dev if you don't have one)
echo.
call eas login
if %errorlevel% neq 0 (
    echo ERROR: Login failed. Please create an account at https://expo.dev first.
    pause
    exit /b 1
)
echo.
echo Step 2: Initialize EAS project (first time only)
call eas init --non-interactive 2>nul
echo.
echo Step 3: Building APK (this takes 10-15 minutes in the cloud)...
echo   Your APK will be available to download when done.
echo.
call eas build --platform android --profile preview --non-interactive
echo.
echo ============================================================
echo  BUILD COMPLETE!
echo  Download your APK from the link shown above,
echo  OR visit: https://expo.dev/accounts/[your-username]/projects
echo ============================================================
pause
