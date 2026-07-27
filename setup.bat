@echo off
setlocal

echo ============================================
echo   NiceCount - Setup and Run
echo ============================================
echo.

REM Tanya password PostgreSQL
set /p PG_PASSWORD="Masukkan password PostgreSQL kamu (default: postgres): "
if "%PG_PASSWORD%"=="" set PG_PASSWORD=postgres

REM Buat .env otomatis jika belum ada
if not exist "%~dp0.env" (
    echo Membuat file .env...
    (
        echo APP_NAME=NiceCount
        echo APP_ENV=development
        echo APP_HOST=0.0.0.0
        echo APP_PORT=8000
        echo APP_BASE_URL=http://localhost:8000
        echo SESSION_SECRET_KEY=vehicle-count-local-secret
        echo DATABASE_URL=postgresql+psycopg://postgres:%PG_PASSWORD%@localhost:5432/vehicle_count
        echo AUTO_CREATE_TABLES=false
        echo STORAGE_ROOT=storage
        echo DEFAULT_MODEL_PATH=v7.pt
        echo DEFAULT_TRACKER_CONFIG=bytetrack.yaml
        echo DEFAULT_CONFIDENCE=0.12
        echo DEFAULT_IOU=0.45
        echo DEFAULT_FRAME_STRIDE=1
        echo DEFAULT_TARGET_ANALYSIS_FPS=8
        echo DEFAULT_PREVIEW_FPS=6
        echo DEFAULT_WORKING_MAX_WIDTH=1600
        echo DEFAULT_PREVIEW_MAX_WIDTH=960
        echo DEFAULT_PREVIEW_JPEG_QUALITY=70
        echo DEFAULT_INFERENCE_IMGSZ=640
        echo DEFAULT_INFERENCE_DEVICE=auto
        echo SAVE_ANNOTATED_VIDEO=true
        echo BOOTSTRAP_ADMIN_USERNAME=admin
        echo BOOTSTRAP_ADMIN_PASSWORD=admin123
        echo BOOTSTRAP_ADMIN_FULL_NAME=Administrator
        echo DEFAULT_SITE_CODE=DEFAULT
        echo DEFAULT_SITE_NAME=Default Site
        echo DEFAULT_SITE_DIRECTION_NORMAL_LABEL=Normal
        echo DEFAULT_SITE_DIRECTION_OPPOSITE_LABEL=Opposite
        echo DEFAULT_LINE_START_X=0.15
        echo DEFAULT_LINE_START_Y=0.58
        echo DEFAULT_LINE_END_X=0.85
        echo DEFAULT_LINE_END_Y=0.58
    ) > "%~dp0.env"
    echo .env berhasil dibuat.
) else (
    echo .env sudah ada, dilewati.
)

echo.
echo Menjalankan setup...
echo.

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\windows\install_windows.ps1" ^
  -UseCurrentDirectory ^
  -PgPassword "%PG_PASSWORD%" ^
  -OpenBrowser

pause
