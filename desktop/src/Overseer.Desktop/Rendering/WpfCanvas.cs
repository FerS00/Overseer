using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using Overseer.Desktop.Core.Drawing;

namespace Overseer.Desktop.Rendering;

/// <summary>Draws <see cref="IMascotCanvas"/> calls onto a WPF <see cref="DrawingContext"/>, caching frozen brushes, pens and geometries.</summary>
public sealed class WpfCanvas(DrawingContext dc) : IMascotCanvas
{
    private static readonly Dictionary<string, Brush> brushes = [];
    private static readonly Dictionary<string, Pen> pens = [];
    private static readonly Dictionary<string, Geometry> geometries = [];

    public void Rect(double x, double y, double width, double height, Paint fill, double radius = 0)
    {
        if (radius > 0) dc.DrawRoundedRectangle(BrushFor(fill), null, new System.Windows.Rect(x, y, width, height), radius, radius);
        else dc.DrawRectangle(BrushFor(fill), null, new System.Windows.Rect(x, y, width, height));
    }

    public void Ellipse(double cx, double cy, double rx, double ry, Paint fill) => dc.DrawEllipse(BrushFor(fill), null, new Point(cx, cy), rx, ry);

    public void Path(string data, Paint? fill, Stroke? stroke) => dc.DrawGeometry(fill is null ? null : BrushFor(fill), stroke is null ? null : PenFor(stroke), GeometryFor(data));

    public void PushTransform(Transform2D transform) => dc.PushTransform(transform switch
    {
        Translate t => new TranslateTransform(t.X, t.Y),
        Scale s => new ScaleTransform(s.X, s.Y, s.CenterX, s.CenterY),
        Rotate r => new RotateTransform(r.Degrees, r.CenterX, r.CenterY),
        _ => throw new ArgumentOutOfRangeException(nameof(transform)),
    });

    public void PushOpacity(double opacity) => dc.PushOpacity(opacity);
    public void Pop() => dc.Pop();

    private static Brush BrushFor(Paint paint)
    {
        var key = paint switch { Solid s => s.Color, LinearGradient g => "gradient:" + g.Key, _ => throw new ArgumentOutOfRangeException(nameof(paint)) };
        if (brushes.TryGetValue(key, out var brush)) return brush;
        if (paint is LinearGradient gradient)
        {
            var linear = new LinearGradientBrush { MappingMode = BrushMappingMode.Absolute, StartPoint = new Point(gradient.X1, gradient.Y1), EndPoint = new Point(gradient.X2, gradient.Y2) };
            foreach (var (color, offset) in gradient.Stops) linear.GradientStops.Add(new GradientStop(ToColor(color), offset));
            brush = linear;
        }
        else brush = new SolidColorBrush(ToColor(((Solid)paint).Color));
        brush.Freeze();
        return brushes[key] = brush;
    }

    private static Pen PenFor(Stroke stroke)
    {
        // Dashed strokes animate their offset, so they are built per frame instead of cached.
        var cacheable = stroke.Dash is null;
        var key = $"{(stroke.Paint is Solid s ? s.Color : ((LinearGradient)stroke.Paint).Key)}|{stroke.Width}|{stroke.Round}";
        if (cacheable && pens.TryGetValue(key, out var cached)) return cached;
        var pen = new Pen(BrushFor(stroke.Paint), stroke.Width) { LineJoin = PenLineJoin.Round };
        if (stroke.Round) pen.StartLineCap = pen.EndLineCap = pen.DashCap = PenLineCap.Round;
        // WPF measures dashes in multiples of the stroke width; SVG uses drawing units.
        if (stroke.Dash is { } dash) pen.DashStyle = new DashStyle(Array.ConvertAll(dash, value => value / stroke.Width), stroke.DashOffset / stroke.Width);
        pen.Freeze();
        if (cacheable) pens[key] = pen;
        return pen;
    }

    private static Geometry GeometryFor(string data)
    {
        if (geometries.TryGetValue(data, out var geometry)) return geometry;
        geometry = Geometry.Parse(data);
        geometry.Freeze();
        return geometries[data] = geometry;
    }

    private static Color ToColor(string hex) => (Color)ColorConverter.ConvertFromString(hex);
}
