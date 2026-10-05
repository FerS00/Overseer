using System.Text;
using static Overseer.Desktop.Core.Drawing.Num;

namespace Overseer.Desktop.Core.Drawing;

/// <summary>Records drawing calls as SVG markup, for previews and tests.</summary>
public sealed class SvgCanvas : IMascotCanvas
{
    private readonly StringBuilder body = new();
    private readonly Dictionary<string, string> defs = [];
    private int depth;

    public int Depth => depth;

    public void Rect(double x, double y, double width, double height, Paint fill, double radius = 0) =>
        body.Append($"<rect x=\"{F(x)}\" y=\"{F(y)}\" width=\"{F(width)}\" height=\"{F(height)}\"{(radius > 0 ? $" rx=\"{F(radius)}\"" : "")} {FillAttr(fill)}/>");

    public void Ellipse(double cx, double cy, double rx, double ry, Paint fill) =>
        body.Append($"<ellipse cx=\"{F(cx)}\" cy=\"{F(cy)}\" rx=\"{F(rx)}\" ry=\"{F(ry)}\" {FillAttr(fill)}/>");

    public void Path(string data, Paint? fill, Stroke? stroke)
    {
        var strokeAttr = stroke is null ? "" : $" stroke=\"{Ref(stroke.Paint)}\" stroke-width=\"{F(stroke.Width)}\""
            + (stroke.Round ? " stroke-linecap=\"round\" stroke-linejoin=\"round\"" : "")
            + (stroke.Dash is { Length: > 0 } dash ? $" stroke-dasharray=\"{string.Join(' ', dash.Select(F))}\" stroke-dashoffset=\"{F(stroke.DashOffset)}\"" : "");
        body.Append($"<path d=\"{data}\" {(fill is null ? "fill=\"none\"" : FillAttr(fill))}{strokeAttr}/>");
    }

    public void PushTransform(Transform2D transform)
    {
        var value = transform switch
        {
            Translate t => $"translate({F(t.X)} {F(t.Y)})",
            Scale s => $"translate({F(s.CenterX)} {F(s.CenterY)}) scale({F(s.X)} {F(s.Y)}) translate({F(-s.CenterX)} {F(-s.CenterY)})",
            Rotate r => $"rotate({F(r.Degrees)} {F(r.CenterX)} {F(r.CenterY)})",
            _ => throw new ArgumentOutOfRangeException(nameof(transform)),
        };
        body.Append($"<g transform=\"{value}\">");
        depth++;
    }

    public void PushOpacity(double opacity) { body.Append($"<g opacity=\"{F(opacity)}\">"); depth++; }

    public void Pop()
    {
        if (depth == 0) throw new InvalidOperationException("Pop without a matching push.");
        body.Append("</g>");
        depth--;
    }

    public string ToSvg(double size, double viewBox) =>
        $"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{F(size)}\" height=\"{F(size)}\" viewBox=\"0 0 {F(viewBox)} {F(viewBox)}\" overflow=\"visible\"><defs>{string.Concat(defs.Values)}</defs>{body}</svg>";

    /// <summary>Body markup only, to embed several drawings in one sheet.</summary>
    public string Markup => $"<defs>{string.Concat(defs.Values)}</defs>{body}";

    private string FillAttr(Paint fill) => $"fill=\"{Ref(fill)}\"";

    private string Ref(Paint paint)
    {
        switch (paint)
        {
            case Solid solid:
                return Color(solid.Color);
            case LinearGradient g:
                defs.TryAdd(g.Key, $"<linearGradient id=\"{g.Key}\" gradientUnits=\"userSpaceOnUse\" x1=\"{F(g.X1)}\" y1=\"{F(g.Y1)}\" x2=\"{F(g.X2)}\" y2=\"{F(g.Y2)}\">"
                    + string.Concat(g.Stops.Select(stop => $"<stop offset=\"{F(stop.Offset)}\" stop-color=\"{stop.Color}\"/>")) + "</linearGradient>");
                return $"url(#{g.Key})";
            default:
                throw new ArgumentOutOfRangeException(nameof(paint));
        }
    }

    /// <summary>Converts WPF #AARRGGBB to rgba(); #RRGGBB passes through.</summary>
    private static string Color(string hex) => hex.Length == 9
        ? $"rgba({Convert.ToInt32(hex[3..5], 16)},{Convert.ToInt32(hex[5..7], 16)},{Convert.ToInt32(hex[7..9], 16)},{F(Convert.ToInt32(hex[1..3], 16) / 255d)})"
        : hex;
}
