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
$referenceWidth = 1402.0
$referenceHeight = 1122.0
$scaleX = $sourceImage.Width / $referenceWidth
$scaleY = $sourceImage.Height / $referenceHeight

$badges = @(
  @{ id = "beacon-member"; x = 82; y = 107; w = 134; h = 123 },
  @{ id = "pioneer"; x = 365; y = 104; w = 124; h = 126 },
  @{ id = "beacon-developer"; x = 621; y = 112; w = 159; h = 121 },
  @{ id = "verified"; x = 907; y = 101; w = 139; h = 133 },
  @{ id = "donator"; x = 1181; y = 105; w = 143; h = 126 },
  @{ id = "prestige"; x = 81; y = 357; w = 142; h = 121 },
  @{ id = "staff"; x = 356; y = 351; w = 132; h = 128 },
  @{ id = "helper"; x = 653; y = 351; w = 96; h = 128 },
  @{ id = "bug-hunter"; x = 916; y = 347; w = 126; h = 134 },
  @{ id = "server-booster"; x = 1196; y = 347; w = 119; h = 135 },
  @{ id = "witness"; x = 77; y = 615; w = 151; h = 99 },
  @{ id = "the-beacon"; x = 354; y = 583; w = 139; h = 143 },
  @{ id = "beacons-princess"; x = 627; y = 607; w = 149; h = 108 },
  @{ id = "found-the-light"; x = 893; y = 599; w = 170; h = 110 },
  @{ id = "not-found"; x = 1192; y = 591; w = 126; h = 132 },
  @{ id = "lost-signal"; x = 75; y = 837; w = 154; h = 132 },
  @{ id = "night-owl"; x = 358; y = 838; w = 133; h = 126 },
  @{ id = "command-relic"; x = 630; y = 840; w = 144; h = 122 },
  @{ id = "prismatic-key"; x = 906; y = 831; w = 139; h = 128 },
  @{ id = "lucky-signal"; x = 1194; y = 827; w = 130; h = 142 }
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
  return $max -lt 42 -and ($max - $min) -lt 24
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

  $canvasSize = 512
  $canvas = [System.Drawing.Bitmap]::new($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $maxSide = 440.0
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
