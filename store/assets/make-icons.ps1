# ClipForge icon generator (all drawing in inline C# to avoid PS marshalling pitfalls)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File store/assets/make-icons.ps1

Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Collections.Generic;

public static class ClipForgeIcons
{
    static Bitmap Render(int size)
    {
        var bmp = new Bitmap(size, size);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            float scale = size / 256f;
            var rect = new RectangleF(0, 0, size, size);

            // squircle-ish rounded rect background with vertical gradient
            float r = 52f * scale;
            var bg = RoundedRect(rect, r);
            using (var brush = new LinearGradientBrush(rect,
                Color.FromArgb(255, 38, 50, 66), Color.FromArgb(255, 13, 18, 27), 90f))
            {
                g.FillPath(brush, bg);
            }
            using (var pen = new Pen(Color.FromArgb(60, 255, 255, 255), Math.Max(1f, 1.5f * scale)))
            {
                g.DrawPath(pen, bg);
            }

            // standard play triangle (pointing right, visually centered)
            float cx = 118f * scale, cy = 118f * scale;
            float halfW = 46f * scale, halfH = 52f * scale;
            var tri = new GraphicsPath();
            tri.AddPolygon(new PointF[] {
                new PointF(cx + halfW, cy),
                new PointF(cx - halfW, cy - halfH),
                new PointF(cx - halfW, cy + halfH)
            });
            tri.CloseFigure();
            using (var triBrush = new LinearGradientBrush(rect,
                Color.FromArgb(245, 255, 255, 255), Color.FromArgb(215, 226, 240), 75f))
            {
                g.FillPath(triBrush, tri);
            }

            // red recording dot (bottom-right, glow + body)
            float dx = 172f * scale, dy = 168f * scale, dr = 38f * scale;
            var glow = new GraphicsPath();
            glow.AddEllipse(dx - dr * 1.7f, dy - dr * 1.7f, dr * 3.4f, dr * 3.4f);
            using (var gb = new PathGradientBrush(glow))
            {
                gb.CenterColor = Color.FromArgb(90, 239, 68, 68);
                gb.SurroundColors = new Color[] { Color.FromArgb(0, 239, 68, 68) };
                g.FillPath(gb, glow);
            }
            var dotRect = new RectangleF(dx - dr, dy - dr, dr * 2f, dr * 2f);
            using (var dotBrush = new LinearGradientBrush(dotRect,
                Color.FromArgb(255, 235, 92, 92), Color.FromArgb(255, 196, 32, 42), 45f))
            {
                g.FillEllipse(dotBrush, dotRect);
            }
        }
        return bmp;
    }

    static GraphicsPath RoundedRect(RectangleF r, float radius)
    {
        var p = new GraphicsPath();
        float d = radius * 2f;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    static Bitmap Dot(int r, int g0, int b)
    {
        var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var brush = new SolidBrush(Color.FromArgb(255, r, g0, b)))
            {
                g.FillEllipse(brush, 5, 5, 22, 22);
            }
        }
        return bmp;
    }

    public static void Generate(string projectRoot, string outDir)
    {
        Directory.CreateDirectory(outDir);
        int[] sizes = new int[] { 16, 24, 32, 48, 64, 128, 256 };
        var pngPaths = new Dictionary<int, string>();
        foreach (var s in sizes)
        {
            string file = Path.Combine(outDir, "icon-" + s + ".png");
            using (var bmp = Render(s)) { bmp.Save(file, System.Drawing.Imaging.ImageFormat.Png); }
            pngPaths[s] = file;
        }

        // multi-size PNG-in-ICO
        string buildDir = Path.Combine(projectRoot, "build");
        Directory.CreateDirectory(buildDir);
        string icoPath = Path.Combine(buildDir, "icon.ico");
        using (var ms = new MemoryStream())
        using (var bw = new BinaryWriter(ms))
        {
            bw.Write((ushort)0); bw.Write((ushort)1); bw.Write((ushort)sizes.Length);
            int offset = 6 + 16 * sizes.Length;
            var blobs = new Dictionary<int, byte[]>();
            foreach (var s in sizes)
            {
                byte[] bytes = File.ReadAllBytes(pngPaths[s]);
                blobs[s] = bytes;
                byte dim = s >= 256 ? (byte)0 : (byte)s;
                bw.Write(dim); bw.Write(dim); bw.Write((byte)0); bw.Write((byte)0);
                bw.Write((ushort)1); bw.Write((ushort)32);
                bw.Write((uint)bytes.Length); bw.Write((uint)offset);
                offset += bytes.Length;
            }
            foreach (var s in sizes) { bw.Write(blobs[s]); }
            bw.Flush();
            File.WriteAllBytes(icoPath, ms.ToArray());
        }

        // tray icons next to script (assets dir)
        using (var idle = Dot(91, 105, 114)) { idle.Save(Path.Combine(outDir, "tray-idle.png"), System.Drawing.Imaging.ImageFormat.Png); }
        using (var rec = Dot(224, 69, 58)) { rec.Save(Path.Combine(outDir, "tray-recording.png"), System.Drawing.Imaging.ImageFormat.Png); }
    }
}
'@ -ReferencedAssemblies System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
[ClipForgeIcons]::Generate($projectRoot, (Join-Path $scriptDir 'icons')) | Out-Null
Write-Output ("icons -> " + (Join-Path $scriptDir 'icons') + " ; ico -> " + (Join-Path $projectRoot 'build\icon.ico'))
