# 窗口探查辅助（stdin/stdout 行协议；坐标物理像素）
# 协议：输入 "x,y|排除句柄1;排除句柄2"，输出 "hwnd|L|T|R|B|标题" 或 "none"
# 启动就绪后立即输出 "ready"（Add-Type 编译约 2~3 秒）

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class Win32Probe {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
  public static List<IntPtr> Handles = new List<IntPtr>();
  public static bool Collect(IntPtr h, IntPtr l) { Handles.Add(h); return true; }
  public static List<IntPtr> EnumTopWindows() {
    Handles.Clear();
    EnumWindows(Collect, IntPtr.Zero);
    return Handles;
  }
}
'@
[Win32Probe]::SetProcessDPIAware() | Out-Null
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
$DWMWA_EXTENDED_FRAME_BOUNDS = 9
$EXCLUDE_CLASSES = @('Progman','WorkerW','Shell_TrayWnd','Shell_SecondaryTrayWnd','TaskListWnd','Button','Windows.UI.Core.CoreWindow','Xaml_WindowedPopupClass')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $halves = $line.Split('|')
  $coords = $halves[0].Split(',')
  $px = [int]$coords[0]
  $py = [int]$coords[1]
  $exclude = @{}
  if ($halves.Count -gt 1 -and $halves[1].Length -gt 0) {
    foreach ($h in $halves[1].Split(';')) { $exclude[$h] = $true }
  }
  $found = $null
  foreach ($hwnd in [Win32Probe]::EnumTopWindows()) {
    if ($exclude.ContainsKey([string]$hwnd)) { continue }
    if (-not [Win32Probe]::IsWindowVisible($hwnd)) { continue }
    $cn = New-Object System.Text.StringBuilder 256
    [void][Win32Probe]::GetClassName($hwnd, $cn, 256)
    if ($EXCLUDE_CLASSES -contains $cn.ToString()) { continue }
    $rect = New-Object Win32Probe+RECT
    [void][Win32Probe]::GetWindowRect($hwnd, [ref]$rect)
    if ($px -lt $rect.L -or $px -ge $rect.R -or $py -lt $rect.T -or $py -ge $rect.B) { continue }
    $sb = New-Object System.Text.StringBuilder 256
    [void][Win32Probe]::GetWindowText($hwnd, $sb, 256)
    if ($sb.ToString().Trim().Length -eq 0) { continue }
    $found = @{ hwnd = [string]$hwnd; rect = $rect; title = $sb.ToString().Trim() }
    break
  }
  if ($null -eq $found) {
    [Console]::Out.WriteLine('none')
    [Console]::Out.Flush()
    continue
  }
  $r = $found.rect
  $dwm = New-Object Win32Probe+RECT
  $hr = [Win32Probe]::DwmGetWindowAttribute([IntPtr][Int64]$found.hwnd, $DWMWA_EXTENDED_FRAME_BOUNDS, [ref]$dwm, [System.Runtime.InteropServices.Marshal]::SizeOf($dwm))
  if ($hr -eq 0) { $r = $dwm }
  [Console]::Out.WriteLine($found.hwnd + '|' + $r.L.ToString() + '|' + $r.T.ToString() + '|' + $r.R.ToString() + '|' + $r.B.ToString() + '|' + $found.title)
  [Console]::Out.Flush()
}
