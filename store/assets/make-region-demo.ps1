# 合成「区域/窗口录制红框指示」官网展示图（不截真实桌面）
# 画布 1366x768 模拟深色桌面 + 中央演示窗口（mandelbrot 帧）+ 红色描边 + 角标
# 产物：store/site/assets/region.png
param(
    [string]$ProjectRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [string]$FramePath = (Join-Path $ProjectRoot 'logs\mandel-frame.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
public class RegionDemo {
  public static void Render(string framePath, string outFile) {
    int W = 1366, H = 768;
    using (Bitmap bmp = new Bitmap(W, H))
    using (Graphics g = Graphics.FromImage(bmp))
    using (Image content = Image.FromFile(framePath)) {
      g.SmoothingMode = SmoothingMode.AntiAlias;
      g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
      g.InterpolationMode = InterpolationMode.HighQualityBicubic;

      // ── 模拟桌面壁纸：深色对角渐变 + 青色光晕 ──
      using (var bg = new LinearGradientBrush(new Rectangle(0, 0, W, H),
          Color.FromArgb(26, 34, 51), Color.FromArgb(13, 17, 23), 115f)) {
        g.FillRectangle(bg, 0, 0, W, H);
      }
      using (var path = new GraphicsPath()) {
        path.AddEllipse(W - 460, -180, 760, 760);
        using (var pgb = new PathGradientBrush(path)) {
          pgb.CenterColor = Color.FromArgb(26, 34, 211, 238);
          pgb.SurroundColors = new Color[] { Color.FromArgb(0, 211, 238) };
          g.FillPath(pgb, path);
        }
      }

      // ── 中央演示窗口（标题栏 + 内容区） ──
      int winW = 1024, winH = 576, titleH = 34;
      int wx = (W - winW) / 2, wy = (H - winH - titleH) / 2 - 16;

      // 窗口投影
      using (var shadow = new GraphicsPath()) {
        shadow.AddRectangle(new Rectangle(wx + 10, wy + 14, winW, winH + titleH));
        using (var sb = new SolidBrush(Color.FromArgb(80, 0, 0, 0))) { g.FillPath(sb, shadow); }
      }
      // 标题栏
      g.FillRectangle(new SolidBrush(Color.FromArgb(22, 27, 34)), wx, wy, winW, titleH);
      // 标题栏三个圆点（mac 风装饰）
      g.FillEllipse(new SolidBrush(Color.FromArgb(255, 95, 86)), wx + 14, wy + titleH / 2 - 6, 12, 12);
      g.FillEllipse(new SolidBrush(Color.FromArgb(255, 189, 46)), wx + 32, wy + titleH / 2 - 6, 12, 12);
      g.FillEllipse(new SolidBrush(Color.FromArgb(39, 201, 63)), wx + 50, wy + titleH / 2 - 6, 12, 12);
      // 标题栏文字
      g.DrawString("ClipForge Demo", new Font("Segoe UI", 12, FontStyle.Regular, GraphicsUnit.Pixel),
          new SolidBrush(Color.FromArgb(139, 148, 158)), wx + 76, wy + 9);
      // 内容区（mandelbrot 帧）
      g.DrawImage(content, new Rectangle(wx, wy + titleH, winW, winH));
      // 窗口外边框
      using (var pen = new Pen(Color.FromArgb(90, 100, 115), 1.2f)) {
        g.DrawRectangle(pen, wx, wy, winW, titleH + winH);
      }

      // ── 红色录制描边（包住整个窗口，外扩 4px；描边在窗口外侧=不会被录进视频） ──
      int pad = 4;
      int fx = wx - pad, fy = wy - pad, fw = winW + pad * 2, fh = (titleH + winH) + pad * 2;
      using (var red = new Pen(Color.FromArgb(239, 68, 68), 3.5f)) {
        g.DrawRectangle(red, fx, fy, fw, fh);
      }
      // 四角加粗 L 标记
      int L = 18;
      using (var red2 = new Pen(Color.FromArgb(248, 113, 113), 5f)) {
        g.DrawLine(red2, fx - 1, fy, fx + L, fy); g.DrawLine(red2, fx, fy - 1, fx, fy + L);
        g.DrawLine(red2, fx + fw - L, fy, fx + fw + 1, fy); g.DrawLine(red2, fx + fw, fy - 1, fx + fw, fy + L);
        g.DrawLine(red2, fx - 1, fy + fh, fx + L, fy + fh); g.DrawLine(red2, fx, fy + fh - L, fx, fy + fh + 1);
        g.DrawLine(red2, fx + fw - L, fy + fh, fx + fw + 1, fy + fh); g.DrawLine(red2, fx + fw, fy + fh - L, fx + fw, fy + fh + 1);
      }
      // 角标：录制区 尺寸（红底白字，置于红框左上外沿）
      string tag = "REC " + winW.ToString() + "x" + (titleH + winH).ToString();
      var tagFont = new Font("Segoe UI", 14, FontStyle.Bold, GraphicsUnit.Pixel);
      SizeF tagSize = g.MeasureString(tag, tagFont);
      int tagPadX = 10, tagPadY = 5;
      int tagW = (int)tagSize.Width + tagPadX * 2, tagH = (int)tagSize.Height + tagPadY * 2;
      int tagX = fx, tagY = fy - tagH - 8;
      using (var rrect = RoundRect(tagX, tagY, tagW, tagH, 6)) {
        g.FillPath(Brushes.Red, rrect);
      }
      g.DrawString(tag, tagFont, Brushes.White, tagX + tagPadX, tagY + tagPadY);

      // ── 底部任务栏示意（半透明条 + 图标方块） ──
      int tbH = 44;
      g.FillRectangle(new SolidBrush(Color.FromArgb(28, 33, 40)), 0, H - tbH, W, tbH);
      using (var p = new Pen(Color.FromArgb(45, 52, 62), 1f)) {
        g.DrawLine(p, 0, H - tbH, W, H - tbH);
      }
      // 开始按钮（青色圆角方块）
      using (var rrect = RoundRect(16, H - tbH + 9, 26, 26, 6)) {
        g.FillPath(new SolidBrush(Color.FromArgb(34, 211, 238)), rrect);
      }
      // 任务栏图标方块
      int ix = 60;
      int[] shades = { 55, 48, 42, 38 };
      for (int i = 0; i < 4; i++) {
        g.FillRectangle(new SolidBrush(Color.FromArgb(shades[i], shades[i] + 6, shades[i] + 13)), ix, H - tbH + 9, 26, 26);
        ix += 34;
      }
      // 系统托盘区（右侧时间条示意）
      g.FillRectangle(new SolidBrush(Color.FromArgb(38, 44, 53)), W - 96, H - tbH + 9, 80, 26);

      bmp.Save(outFile, ImageFormat.Png);
    }
  }

  static GraphicsPath RoundRect(int x, int y, int w, int h, int r) {
    var p = new GraphicsPath();
    p.AddArc(x, y, r * 2, r * 2, 180, 90);
    p.AddArc(x + w - r * 2, y, r * 2, r * 2, 270, 90);
    p.AddArc(x + w - r * 2, y + h - r * 2, r * 2, r * 2, 0, 90);
    p.AddArc(x, y + h - r * 2, r * 2, r * 2, 90, 90);
    p.CloseFigure();
    return p;
  }
}
'@

$outDir = Join-Path $ProjectRoot 'store\site\assets'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir 'region.png'
[RegionDemo]::Render($FramePath, $out)
Write-Host "region demo -> $out"
Get-Item $out | ForEach-Object { Write-Host ("{0} bytes" -f $_.Length) }
