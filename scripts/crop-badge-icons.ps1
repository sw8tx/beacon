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
$scaleX = $sourceImage.Width / 1536.0
$scaleY = $sourceImage.Height / 1024.0

$badges = @(
  @{ id = "verified"; x = 78; y = 45; w = 150; h = 142 },
  @{ id = "beacon-member"; x = 357; y = 54; w = 128; h = 140 },
  @{ id = "pioneer"; x = 615; y = 58; w = 220; h = 120 },
  @{ id = "beacon-developer"; x = 928; y = 47; w = 145; h = 132 },
  @{ id = "donator"; x = 1230; y = 56; w = 155; h = 126 },
  @{ id = "premium"; x = 88; y = 304; w = 134; h = 116 },
  @{ id = "staff"; x = 361; y = 283; w = 126; h = 151 },
  @{ id = "helper"; x = 630; y = 316; w = 172; h = 118 },
  @{ id = "bug-hunter"; x = 939; y = 300; w = 155; h = 142 },
  @{ id = "server-booster"; x = 1252; y = 303; w = 105; h = 134 },
  @{ id = "the-beacon"; x = 77; y = 551; w = 152; h = 133 },
  @{ id = "beacons-princess"; x = 338; y = 553; w = 155; h = 132 },
  @{ id = "not-found"; x = 649; y = 548; w = 135; h = 132 },
  @{ id = "lost-signal"; x = 926; y = 558; w = 161; h = 121 },
  @{ id = "night-owl"; x = 1236; y = 548; w = 126; h = 137 },
  @{ id = "command-relic"; x = 93; y = 782; w = 128; h = 134 },
  @{ id = "prismatic-key"; x = 365; y = 779; w = 130; h = 140 },
  @{ id = "lucky-signal"; x = 648; y = 774; w = 142; h = 137 },
  @{ id = "found-the-light"; x = 944; y = 773; w = 114; h = 147 },
  @{ id = "witness"; x = 1234; y = 777; w = 126; h = 133 }
)

function New-Rectangle($x, $y, $w, $h) {
  [System.Drawing.Rectangle]::new(
    [int][Math]::Round($x * $script:scaleX),
    [int][Math]::Round($y * $script:scaleY),
    [int][Math]::Round($w * $script:scaleX),
    [int][Math]::Round($h * $script:scaleY)
  )
}

function Remove-WhiteBackground([System.Drawing.Bitmap]$bitmap) {
  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      $color = $bitmap.GetPixel($x, $y)
      $whiteDistance = [Math]::Max([Math]::Max(255 - $color.R, 255 - $color.G), 255 - $color.B)
      if ($color.R -gt 238 -and $color.G -gt 238 -and $color.B -gt 238) {
        $alpha = [Math]::Min(255, [Math]::Max(0, $whiteDistance * 18))
        $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B))
      }
    }
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
