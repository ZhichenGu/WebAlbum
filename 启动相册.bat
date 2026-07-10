@echo off
:: ============================================================
:: 互动相册启动脚本
:: 用 Chrome/Edge 的 --app --kiosk 模式打开 index.html，
:: 效果是全屏无边框、看不到地址栏和标签页，就像一个独立程序。
:: 把这个 .bat 放在和 index.html 同一个文件夹里即可，
:: 挪动/改名这个文件夹都不用改脚本，路径是自动识别的。
:: ============================================================
setlocal

:: 当前脚本所在文件夹（自动识别，不用手动填路径）
set "APP_DIR=%~dp0"
set "APP_DIR=%APP_DIR:~0,-1%"
set "APP_URL=file:///%APP_DIR:\=/%/index.html"

:: 给相册用的独立浏览器数据目录：上传的照片/视频（IndexedDB）、
:: 主题色、深浅色模式都存在这里。删掉这个文件夹 = 恢复出厂设置。
set "PROFILE_DIR=%APP_DIR%\.browser-profile"

:: 依次查找 Chrome，找不到就用 Windows 自带的 Edge
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER (
    echo 没找到 Chrome 或 Edge，请先安装其中一个浏览器再运行本脚本。
    pause
    exit /b 1
)

start "" "%BROWSER%" ^
    --kiosk ^
    --app="%APP_URL%" ^
    --user-data-dir="%PROFILE_DIR%" ^
    --no-first-run ^
    --noerrdialogs ^
    --disable-infobars ^
    --disable-session-crashed-bubble ^
    --disable-pinch ^
    --overscroll-history-navigation=0 ^
    --use-fake-ui-for-media-stream ^
    --autoplay-policy=no-user-gesture-required ^
    --allow-file-access-from-files

exit
