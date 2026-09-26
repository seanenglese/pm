$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

docker compose up --build
