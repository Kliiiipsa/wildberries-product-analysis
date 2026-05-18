Set-Location "E:\project1"
Write-Host "WB Analyzer запускается..." -ForegroundColor Cyan
Write-Host "Открой браузер: http://localhost:3000" -ForegroundColor Green
& "C:\Program Files\nodejs\node.exe" "E:\project1\node_modules\next\dist\bin\next" dev
