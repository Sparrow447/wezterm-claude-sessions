# screenshot.ps1 - opens a WezTerm window with the fake chat + demo panel and
# saves docs/screenshot.png (whole window) and docs/panel.png (just the panel).
# Windows only.
#
#   pwsh docs/demo/screenshot.ps1
#
# Everything on screen is made up: the chat is fake-chat.js, the panel runs
# with --demo, and the tab icons / status bar read a temporary state folder
# instead of your real ~/.claude/dashboard.

$repo = Resolve-Path "$PSScriptRoot/../.."
$shot = Join-Path $repo "docs/screenshot.png"
$panelShot = Join-Path $repo "docs/panel.png"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
[Win]::SetProcessDPIAware() | Out-Null

# A throwaway dashboard folder so nothing real shows up in the tab bar.
$fakeDir = Join-Path ([IO.Path]::GetTempPath()) "wezterm-claude-demo"
Remove-Item -Recurse -Force $fakeDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $fakeDir | Out-Null
$env:CLAUDE_DASHBOARD_DIR = $fakeDir

$before = @(Get-Process wezterm-gui -ErrorAction SilentlyContinue | ForEach-Object Id)

# Solid background so whatever is behind the window doesn't show through.
Start-Process wezterm -ArgumentList @(
  "--config-file", "$repo/wezterm/wezterm.lua",
  "--config", "window_background_opacity=1.0",
  "--config", "win32_system_backdrop='Disable'",
  "--config", "font_size=10",
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
$h = $proc.MainWindowHandle

# Fit the window inside the work area (the screen minus the taskbar).
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$w = [Math]::Min(1640, $wa.Width - 40); $ht = [Math]::Min(1100, $wa.Height - 20)
[Win]::MoveWindow($h, $wa.Left + 20, $wa.Top + 10, $w, $ht, $true) | Out-Null

Start-Sleep -Seconds 4   # let the panel draw a few frames

# Ask the window to paint itself into a bitmap. Unlike a screen grab this
# only ever contains WezTerm, even if another window is on top of it.
$win = New-Object Win+RECT; [Win]::GetWindowRect($h, [ref]$win) | Out-Null
$full = New-Object System.Drawing.Bitmap ($win.Right - $win.Left), ($win.Bottom - $win.Top)
$g = [System.Drawing.Graphics]::FromImage($full)
$dc = $g.GetHdc()
[Win]::PrintWindow($h, $dc, 2) | Out-Null   # 2 = PW_RENDERFULLCONTENT (needed for GPU-drawn windows)
$g.ReleaseHdc($dc); $g.Dispose()

# Trim the invisible resize border: DWM knows where the visible frame is.
$vis = New-Object Win+RECT
if ([Win]::DwmGetWindowAttribute($h, 9, [ref]$vis, 16) -ne 0) { $vis = $win }
$crop = New-Object System.Drawing.Rectangle ($vis.Left - $win.Left), ($vis.Top - $win.Top), ($vis.Right - $vis.Left), ($vis.Bottom - $vis.Top)
$img = $full.Clone($crop, $full.PixelFormat)
$img.Save($shot, [System.Drawing.Imaging.ImageFormat]::Png)

# The panel is the right 34% of the tab; skip the title bar and tab bar.
$top = 64
$px = [int]($img.Width * 0.655)
$panel = $img.Clone((New-Object System.Drawing.Rectangle $px, $top, ($img.Width - $px), ($img.Height - $top)), $img.PixelFormat)
$panel.Save($panelShot, [System.Drawing.Imaging.ImageFormat]::Png)
$full.Dispose(); $img.Dispose(); $panel.Dispose()

Stop-Process -Id $proc.Id
Remove-Item -Recurse -Force $fakeDir -ErrorAction SilentlyContinue
Write-Output "saved $shot and $panelShot"
