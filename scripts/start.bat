@echo off
setlocal

set ROOT_DIR=%~dp0..
cd /d "%ROOT_DIR%"

docker compose up --build
