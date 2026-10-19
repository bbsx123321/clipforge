# 商店 hero 展示图合成：深色渐变背景 + 图标 + 双语标题 + 功能点 + 编辑器截图
# 产物：store/listing/shots/hero-zh.png、hero-en.png（1920×1080，微软商店首图规格）
param(
    [string]$ProjectRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# ── 布局常量 ──
$W = 1920
$H = 1080

# 内联 C# 绘制逻辑（避免 PowerShell 编组问题，全部逻辑放托管代码）
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
public class HeroRenderer {
  public static void Render(string projectRoot, string outFile, bool english) {
    int W = 1920, H = 1080;
    using (Bitmap bmp = new Bitmap(W, H))
    using (Graphics g = Graphics.FromImage(bmp)) {
      g.SmoothingMode = SmoothingMode.AntiAlias;
      g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
      g.InterpolationMode = InterpolationMode.HighQualityBicubic;

      // 背景：深灰蓝对角渐变（与图标一致的配色）
      using (var bg = new LinearGradientBrush(new Rectangle(0, 0, W, H),
          Color.FromArgb(38, 50, 66), Color.FromArgb(13, 18, 27), 110f)) {
        g.FillRectangle(bg, 0, 0, W, H);
      }
      // 背景装饰：右上大圆光晕（青色低调）
      using (var glow = new GraphicsPath()) {
        glow.AddEllipse(W - 700, -350, 1100, 1100);
        using (var pgb = new PathGradientBrush(glow)) {
          pgb.CenterColor = Color.FromArgb(36, 211, 238);
          pgb.SurroundColors = new Color[] { Color.FromArgb(0, 211, 238) };
          g.FillPath(pgb, glow);
        }
      }
      // 背景装饰：左下红色录制点光晕
      using (var glow2 = new GraphicsPath()) {
        glow2.AddEllipse(-260, H - 420, 760, 760);
        using (var pgb = new PathGradientBrush(glow2)) {
          pgb.CenterColor = Color.FromArgb(40, 224, 90, 58);
          pgb.SurroundColors = new Color[] { Color.FromArgb(0, 224, 90, 58) };
          g.FillPath(pgb, glow2);
        }
      }

      // ── 左栏：图标 + 标题 + 功能点 ──
      string iconPath = System.IO.Path.Combine(projectRoot, "store", "assets", "icons", "icon-256.png");
      using (Image icon = Image.FromFile(iconPath)) {
        g.DrawImage(icon, new Rectangle(140, 150, 176, 176));
      }

      string title = english ? "ClipForge" : "ClipForge · 剪录坊";
      string subtitle = english
        ? "Screen recorder + lightweight video editor"
        : "录屏 + 视频剪辑，二合一";
      string[] features = english
        ? new string[] {
            "Record fullscreen, region or a single app window",
            "System audio & microphone mixing, NVENC accelerated",
            "Trim, speed up, remove segments and export MP4"
          }
        : new string[] {
            "全屏 / 区域 / 软件窗口三种录制模式",
            "系统声音 + 麦克风混录，硬件编码加速",
            "裁剪、加速、删除段落，一键导出 MP4"
          };

      var titleFont = new Font("Segoe UI Semibold", 58, FontStyle.Regular, GraphicsUnit.Pixel);
      var subFont = new Font("Microsoft YaHei UI", 30, FontStyle.Regular, GraphicsUnit.Pixel);
      var featFont = new Font("Microsoft YaHei UI", 27, FontStyle.Regular, GraphicsUnit.Pixel);
      g.DrawString(title, titleFont, Brushes.White, 136, 372);
      g.DrawString(subtitle, subFont, new SolidBrush(Color.FromArgb(148, 163, 184)), 140, 452);

      // 功能点：红色圆点 + 文字
      float fy = 556;
      foreach (string line in features) {
        g.FillEllipse(Brushes.Red, 146, fy + 11, 12, 12);
        g.DrawString(line, featFont, new SolidBrush(Color.FromArgb(226, 232, 240)), 176, fy);
        fy += 62;
      }

      // ── 右栏：编辑器截图（带白色描边与投影感） ──
      string shotPath = System.IO.Path.Combine(projectRoot, "store", "listing", "shots",
          english ? "editor-en.png" : "editor-zh.png");
      using (Image shot = Image.FromFile(shotPath)) {
        // 目标区域：右侧 860 宽（保持 1400:800 比例 → 860×491），微透视斜放太复杂 → 直角摆放
        int sw = 880, sh = sw * 800 / 1400;
        int sx = W - sw - 118, sy = (H - sh) / 2 + 40;
        // 阴影
        using (var shadow = new GraphicsPath()) {
          shadow.AddRectangle(new Rectangle(sx + 14, sy + 18, sw, sh));
          using (var sb = new SolidBrush(Color.FromArgb(70, 0, 0, 0))) { g.FillPath(sb, shadow); }
        }
        // 白描边底
        g.FillRectangle(Brushes.White, sx - 5, sy - 5, sw + 10, sh + 10);
        g.DrawImage(shot, new Rectangle(sx, sy, sw, sh));
      }

      bmp.Save(outFile, ImageFormat.Png);
    }
  }
}
'@

$shotsDir = Join-Path $ProjectRoot 'store\listing\shots'
[HeroRenderer]::Render($ProjectRoot, (Join-Path $shotsDir 'hero-zh.png'), $false)
[HeroRenderer]::Render($ProjectRoot, (Join-Path $shotsDir 'hero-en.png'), $true)
Write-Host "hero -> $shotsDir"
Get-ChildItem $shotsDir\hero-*.png | ForEach-Object { Write-Host ("{0}  {1} bytes" -f $_.Name, $_.Length) }
