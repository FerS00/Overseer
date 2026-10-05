using System.Globalization;

namespace Overseer.Desktop.Core.Drawing;

public abstract record Paint;
public sealed record Solid(string Color) : Paint;
/// <summary>Linear gradient in user-space coordinates, like <c>gradientUnits="userSpaceOnUse"</c>.</summary>
public sealed record LinearGradient(string Key, double X1, double Y1, double X2, double Y2, params (string Color, double Offset)[] Stops) : Paint;

/// <summary>Stroke style. <see cref="Dash"/> and <see cref="DashOffset"/> are in drawing units, as in SVG.</summary>
public sealed record Stroke(Paint Paint, double Width, bool Round = true, double[]? Dash = null, double DashOffset = 0);

public abstract record Transform2D;
public sealed record Translate(double X, double Y) : Transform2D;
public sealed record Scale(double X, double Y, double CenterX = 0, double CenterY = 0) : Transform2D;
public sealed record Rotate(double Degrees, double CenterX = 0, double CenterY = 0) : Transform2D;

/// <summary>
/// Minimal immediate-mode surface the mascots are drawn on. The WPF app implements it over DrawingContext;
/// <see cref="SvgCanvas"/> implements it for previews and tests. Path data uses the syntax shared by SVG and WPF.
/// </summary>
public interface IMascotCanvas
{
    void Rect(double x, double y, double width, double height, Paint fill, double radius = 0);
    void Ellipse(double cx, double cy, double rx, double ry, Paint fill);
    void Path(string data, Paint? fill, Stroke? stroke);
    void PushTransform(Transform2D transform);
    void PushOpacity(double opacity);
    void Pop();
}

public static class Num
{
    /// <summary>Culture-invariant number for path data: "4.5", never "4,5".</summary>
    public static string F(double value) => value.ToString("0.###", CultureInfo.InvariantCulture);
}
