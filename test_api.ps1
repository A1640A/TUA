# TUA Route API  -  İlk Test
# Kullanım: .\test_api.ps1

$ApiUrl = "http://localhost:5168/api/route/calculate"
$GridSize = 64
$CellCount = $GridSize * $GridSize   # 4096

# HeightMap: sin dalgası (0..10 arası yükseklik)
$heightMap = 0..($CellCount - 1) | ForEach-Object {
    [float]([math]::Sin($_ * 0.05) * 5 + 5)
}

# CraterMap: Her 300. hücre civarında krater riski
$craterMap = 0..($CellCount - 1) | ForEach-Object {
    $mod = $_ % 300
    if ($mod -lt 10) { [float]0.8 } else { [float]0.0 }
}

$body = @{
    startNode   = @{ x = 10; z = 10 }
    endNode     = @{ x = 50; z = 50 }
    gridSize    = $GridSize
    heightMap   = $heightMap
    craterMap   = $craterMap
    costWeights = @{
        slopeWeight      = 2.5
        craterRiskWeight = 5.0
        elevationWeight  = 1.0
    }
} | ConvertTo-Json -Depth 5

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  TUA Route API  -  CANLI TEST" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "Endpoint : $ApiUrl" -ForegroundColor Gray
Write-Host "Grid     : ${GridSize}x${GridSize} = $CellCount hücre" -ForegroundColor Gray
Write-Host "Start    : (10,10)  ->  End: (50,50)" -ForegroundColor Gray
Write-Host ""

try {
    $resp = Invoke-RestMethod -Uri $ApiUrl -Method POST `
        -ContentType "application/json" -Body $body

    Write-Host "SONUÇ:" -ForegroundColor Green
    Write-Host "  Success      : $($resp.success)"    -ForegroundColor Cyan
    Write-Host "  Adım Sayısı  : $($resp.stepCount)"  -ForegroundColor Cyan
    Write-Host "  Toplam Maliyet: $([math]::Round($resp.totalCost, 3))" -ForegroundColor Cyan
    Write-Host "  API Süresi   : $($resp.elapsedMs) ms" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "İLK 3 NOKTA:" -ForegroundColor Yellow
    $resp.path | Select-Object -First 3 | ForEach-Object {
        Write-Host ("  X={0,-4} Z={1,-4} Y={2,-8} Local Cost={3}" -f `
            $_.x, $_.z, [math]::Round($_.y, 3), [math]::Round($_.localCost, 3))
    }
    Write-Host "..."
    Write-Host "SON NOKTA:" -ForegroundColor Yellow
    $resp.path | Select-Object -Last 1 | ForEach-Object {
        Write-Host ("  X={0,-4} Z={1,-4} Y={2,-8} Local Cost={3}" -f `
            $_.x, $_.z, [math]::Round($_.y, 3), [math]::Round($_.localCost, 3))
    }
    Write-Host ""
    Write-Host "TEST BASARILI" -ForegroundColor Green
}
catch {
    Write-Host "TEST BASARISIZ!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
