# 생성된 1024px 에셋을 게임용 크기로 축소한다 (알파 보존, 고품질 보간).
# 사용법: powershell -File tools/resize-assets.ps1
Add-Type -AssemblyName System.Drawing

$dir = Join-Path $PSScriptRoot "..\public\assets"
$sizes = @{
  "player-knight" = 256; "enemy-ghoul" = 256; "enemy-archer" = 256; "enemy-brute" = 256;
  "prop-torch" = 256; "core-crystal" = 256; "floor-stone" = 512;
  "floor-cave" = 512; "floor-abyss" = 512; "prop-mushroom" = 256; "prop-coral" = 256;
  "prop-device" = 256; "prop-chest" = 256; "prop-anvil" = 256; "prop-merchant" = 256
}

foreach ($name in $sizes.Keys) {
  $path = Join-Path $dir "$name.png"
  if (-not (Test-Path $path)) { Write-Output "건너뜀(없음): $name"; continue }
  $size = $sizes[$name]
  $src = New-Object System.Drawing.Bitmap($path)
  if ($src.Width -le $size) { $src.Dispose(); Write-Output "건너뜀(이미 작음): $name"; continue }
  $dst = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose(); $src.Dispose()
  $dst.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
  Write-Output "축소 완료: $name -> ${size}px"
}
