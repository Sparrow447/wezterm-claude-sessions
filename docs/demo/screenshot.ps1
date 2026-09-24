# screenshot.ps1 - opens a WezTerm window with the fake chat + demo panel and
# saves a screenshot of it to docs/screenshot.png. Windows only.
#
#   pwsh docs/demo/screenshot.ps1

$repo = Resolve-Path "$PSScriptRoot/../.."
$out = Join-Path $repo "docs/screenshot.png"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
Add-Type -AssemblyName System.Drawing
[Win]::SetProcessDPIAware() | Out-Null

$before = @(Get-Process wezterm-gui -ErrorAction SilentlyContinue | ForEach-Object Id)

# Solid background for the screenshot so nothing behind the window shows through.
Start-Process wezterm -ArgumentList @(
  "--config-file", "$repo/wezterm/wezterm.lua",
  "--config", "window_background_opacity=1.0",
  "--config", "win32_system_backdrop='Disable'",
  "--config", "font_size=10.5",
  "--config", "initial_cols=200", "--config", "initial_rows=44",
  "start", "--always-new-process", "--cwd", "$repo",
  "--", "node", "$repo/docs/demo/fake-chat.js"
)

$proc = $null
for ($i = 0; $i -lt 40 -and -not $proc; $i++) {
  Start-Sleep -Milliseconds 250
  $proc = Get-Process wezterm-gui -ErrorAction SilentlyContinue |
    Where-Object { $before -notcontains $_.Id -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
}
if (-not $proc) { throw "WezTerm window didn't show up" }

Start-Sleep -Seconds 4   # let the panel draw a couple of frames
$h = $proc.MainWindowHandle
[Win]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500

# DWM frame bounds = the visible window without the invisible resize border.
$r = New-Object Win+RECT
if ([Win]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -ne 0) { [Win]::GetWindowRect($h, [ref]$r) | Out-Null }
$w = $r.Right - $r.Left; $hgt = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap $w, $hgt
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

Stop-Process -Id $proc.Id
Write-Output "saved $out ($w x $hgt)"
