param(
  [string]$Source = "assets/badge-icons-source.png",
  [string]$OutputDir = "assets/badges"
)

Add-Type -AssemblyName System.Drawing

if (!(Test-Path -LiteralPath $Source)) {
  throw "Source screenshot not found: $Source"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$sourceImage = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $Source))
$scaleX = $sourceImage.Width / 257.0
$scaleY = $sourceImage.Height / 189.0

$badges = @(
  @{ id = "verified"; x = 10; y = 9; w = 31; h = 29 },
  @{ id = "beacon-member"; x = 63; y = 8; w = 28; h = 34 },
  @{ id = "pioneer"; x = 105; y = 10; w = 44; h = 31 },
  @{ id = "beacon-developer"; x = 163; y = 8; w = 32; h = 34 },
  @{ id = "donator"; x = 216; y = 8; w = 31; h = 34 },
  @{ id = "premium"; x = 12; y = 62; w = 31; h = 32 },
  @{ id = "staff"; x = 63; y = 57; w = 30; h = 40 },
  @{ id = "helper"; x = 106; y = 64; w = 44; h = 31 },
  @{ id = "bug-hunter"; x = 163; y = 60; w = 35; h = 37 },
  @{ id = "server-booster"; x = 218; y = 60; w = 29; h = 38 },
  @{ id = "the-beacon"; x = 9; y = 110; w = 36; h = 38 },
  @{ id = "beacons-princess"; x = 59; y = 111; w = 39; h = 36 },
  @{ id = "not-found"; x = 113; y = 112; w = 34; h = 34 },
  @{ id = "lost-signal"; x = 162; y = 112; w = 39; h = 34 },
  @{ id = "night-owl"; x = 217; y = 109; w = 31; h = 39 },
  @{ id = "command-relic"; x = 9; y = 157; w = 34; h = 30 },
  @{ id = "prismatic-key"; x = 62; y = 153; w = 32; h = 35 },
  @{ id = "lucky-signal"; x = 111; y = 153; w = 36; h = 35 },
  @{ id = "found-the-light"; x = 166; y = 152; w = 29; h = 36 },
  @{ id = "witness"; x = 216; y = 153; w = 32; h = 35 }
)

function New-Rectangle($x, $y, $w, $h) {
  [System.Drawing.Rectangle]::new(
    [int][Math]::Round($x * $script:scaleX),
    [int][Math]::Round($y * $script:scaleY),
    [int][Math]::Round($w * $script:scaleX),
    [int][Math]::Round($h * $script:scaleY)
  )
}

function Test-BackgroundPixel([System.Drawing.Color]$color) {
  $max = [Math]::Max([Math]::Max($color.R, $color.G), $color.B)
  $min = [Math]::Min([Math]::Min($color.R, $color.G), $color.B)
  return $color.R -gt 205 -and $color.G -gt 205 -and $color.B -gt 205 -and ($max - $min) -lt 42
}

function Remove-WhiteBackground([System.Drawing.Bitmap]$bitmap) {
  $visited = New-Object 'bool[,]' $bitmap.Width, $bitmap.Height
  $queue = New-Object System.Collections.Generic.Queue[System.Drawing.Point]

  for ($x = 0; $x -lt $bitmap.Width; $x++) {
    $queue.Enqueue([System.Drawing.Point]::new($x, 0))
    $queue.Enqueue([System.Drawing.Point]::new($x, $bitmap.Height - 1))
  }
  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    $queue.Enqueue([System.Drawing.Point]::new(0, $y))
    $queue.Enqueue([System.Drawing.Point]::new($bitmap.Width - 1, $y))
  }

  while ($queue.Count -gt 0) {
    $point = $queue.Dequeue()
    if ($point.X -lt 0 -or $point.Y -lt 0 -or $point.X -ge $bitmap.Width -or $point.Y -ge $bitmap.Height) { continue }
    if ($visited[$point.X, $point.Y]) { continue }
    $visited[$point.X, $point.Y] = $true

    $color = $bitmap.GetPixel($point.X, $point.Y)
    if (!(Test-BackgroundPixel $color)) { continue }

    $bitmap.SetPixel($point.X, $point.Y, [System.Drawing.Color]::FromArgb(0, $color.R, $color.G, $color.B))
    $queue.Enqueue([System.Drawing.Point]::new($point.X + 1, $point.Y))
    $queue.Enqueue([System.Drawing.Point]::new($point.X - 1, $point.Y))
    $queue.Enqueue([System.Drawing.Point]::new($point.X, $point.Y + 1))
    $queue.Enqueue([System.Drawing.Point]::new($point.X, $point.Y - 1))
  }
}

function Get-ContentBounds([System.Drawing.Bitmap]$bitmap) {
  $minX = $bitmap.Width
  $minY = $bitmap.Height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      if ($bitmap.GetPixel($x, $y).A -gt 12) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt 0) {
    return [System.Drawing.Rectangle]::new(0, 0, $bitmap.Width, $bitmap.Height)
  }

  $pad = 5
  $x0 = [Math]::Max(0, $minX - $pad)
  $y0 = [Math]::Max(0, $minY - $pad)
  $x1 = [Math]::Min($bitmap.Width - 1, $maxX + $pad)
  $y1 = [Math]::Min($bitmap.Height - 1, $maxY + $pad)
  [System.Drawing.Rectangle]::new($x0, $y0, $x1 - $x0 + 1, $y1 - $y0 + 1)
}

foreach ($badge in $badges) {
  $cropRect = New-Rectangle $badge.x $badge.y $badge.w $badge.h
  $crop = $sourceImage.Clone($cropRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  Remove-WhiteBackground $crop
  $bounds = Get-ContentBounds $crop
  $trimmed = $crop.Clone($bounds, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

  $canvasSize = 160
  $canvas = [System.Drawing.Bitmap]::new($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $maxSide = 138.0
  $ratio = [Math]::Min($maxSide / $trimmed.Width, $maxSide / $trimmed.Height)
  $drawW = [int][Math]::Round($trimmed.Width * $ratio)
  $drawH = [int][Math]::Round($trimmed.Height * $ratio)
  $drawX = [int][Math]::Round(($canvasSize - $drawW) / 2)
  $drawY = [int][Math]::Round(($canvasSize - $drawH) / 2)
  $graphics.DrawImage($trimmed, $drawX, $drawY, $drawW, $drawH)

  $out = Join-Path $OutputDir "$($badge.id).png"
  $canvas.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

  $graphics.Dispose()
  $canvas.Dispose()
  $trimmed.Dispose()
  $crop.Dispose()
  Write-Output "Wrote $out"
}

$sourceImage.Dispose()
