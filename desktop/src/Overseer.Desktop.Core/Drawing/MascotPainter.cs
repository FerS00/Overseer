using static Overseer.Desktop.Core.Drawing.Num;

namespace Overseer.Desktop.Core.Drawing;

/// <summary>
/// Immediate-mode port of the approved mascots (design-system/agent-ops/prototype-v4.html, revision 4c).
/// Geometry and colors are copied from the SVG; each CSS keyframe becomes a function of the time <c>t</c> in seconds.
/// Chispa uses a 24×24 pixel grid; Nodo, Astro and Hondo use the 120×120 view box.
/// </summary>
public static class MascotPainter
{
    public static readonly IReadOnlyList<string> Kinds = ["chispa", "nodo", "astro", "hondo"];

    /// <summary>Size of the drawing's own coordinate system.</summary>
    public static double ViewBox(string kind) => kind == "chispa" ? 24 : 120;

    /// <summary>Draws <paramref name="kind"/> in <paramref name="state"/> at time <paramref name="t"/>, scaled to <paramref name="size"/>.</summary>
    public static void Draw(IMascotCanvas c, string kind, MascotState state, double t, double size)
    {
        var scale = size / ViewBox(kind);
        With(c, new Scale(scale, scale), () =>
        {
            switch (kind)
            {
                case "chispa": Chispa(c, state, t); break;
                case "nodo": Nodo(c, state, t); break;
                case "astro": Astro(c, state, t); break;
                case "hondo": Hondo(c, state, t); break;
            }
        });
    }

    // ---------- timing helpers (CSS keyframe equivalents) ----------

    internal static double Phase(double t, double period, double delay = 0) { var p = ((t - delay) % period) / period; return p < 0 ? p + 1 : p; }
    internal static int Step(double t, double period, int steps) => Math.Min(steps - 1, (int)(Phase(t, period) * steps));
    /// <summary>0 → 1 → 0 with ease-in-out, for "50% { … }" keyframes.</summary>
    internal static double Wave(double t, double period) => (1 - Math.Cos(2 * Math.PI * Phase(t, period))) / 2;
    /// <summary>m-blink with steps(1): full opacity for the first half, <paramref name="low"/> for the second.</summary>
    internal static double Blink(double t, double period, double low = .2) => Phase(t, period) < .5 ? 1 : low;
    /// <summary>m-dot: .25 → 1 → .25 in thirds.</summary>
    internal static double Dot(double t, double period, double delay) { var p = Phase(t, period, delay); return p >= 1d / 3 && p < 2d / 3 ? 1 : .25; }
    /// <summary>m-float for the "z": rises 3 units and fades.</summary>
    private static (double Dy, double Opacity) Float(double t, bool stepped) { var p = stepped ? Step(t, 2.4, 4) / 4d : Phase(t, 2.4); return (-3 * p, 1 - .8 * p); }

    // ---------- drawing helpers ----------

    private static void With(IMascotCanvas c, Transform2D transform, Action draw) { c.PushTransform(transform); draw(); c.Pop(); }
    private static void Faded(IMascotCanvas c, double opacity, Action draw) { c.PushOpacity(opacity); draw(); c.Pop(); }
    private static Solid S(string color) => new(color);
    private static Stroke Pen(string color, double width) => new(S(color), width);

    private static void R(IMascotCanvas c, double x, double y, double w, double h, string color) => c.Rect(x, y, w, h, S(color));
    private static void Line(IMascotCanvas c, Stroke pen, double x1, double y1, double x2, double y2) => c.Path($"M{F(x1)},{F(y1)} L{F(x2)},{F(y2)}", null, pen);
    private static void Circle(IMascotCanvas c, string color, double cx, double cy, double r) => c.Ellipse(cx, cy, r, r, S(color));
    private static void Shadow(IMascotCanvas c, double cx, double cy, double rx) => c.Ellipse(cx, cy, rx, 3.5, S("#8C000000"));
    private static void Polyline(IMascotCanvas c, Stroke pen, params double[] xy)
    {
        var data = $"M{F(xy[0])},{F(xy[1])}";
        for (var i = 2; i < xy.Length; i += 2) data += $" L{F(xy[i])},{F(xy[i + 1])}";
        c.Path(data, null, pen);
    }

    /// <summary>Gradient color triplets shared by the flat mascots for permission, error and sleeping.</summary>
    private static (string, string, string) StateTriplet(MascotState state, (string, string, string) normal, (string, string, string) sleeping) => state switch
    {
        MascotState.Permission => ("#FFD27A", "#F6A93B", "#D9822B"),
        MascotState.Error => ("#FFA3A3", "#F26B6B", "#C93A4A"),
        MascotState.Sleeping => sleeping,
        _ => normal,
    };

    /// <summary>The sleeping "z" glyph, drawn as a path so no font is needed.</summary>
    private static void Zz(IMascotCanvas c, double x, double y, double t)
    {
        var (dy, opacity) = Float(t, false);
        Faded(c, opacity, () => With(c, new Translate(x, y - 12 + dy), () => c.Path("M0,0 H9 L0,11 H9", null, Pen("#98A2B8", 2.2))));
    }

    /// <summary>nodo-pop: 1 → 1.1 at 30% → 1, ease-out, 0.9 s.</summary>
    private static Scale Pop(double t, double cx, double cy)
    {
        var p = Phase(t, .9);
        var scale = p < .3 ? 1 + .1 * (p / .3) : 1.1 - .1 * ((p - .3) / .7);
        return new Scale(scale, scale, cx, cy);
    }

    // ---------- Chispa (Claude Code): pixel flame ----------

    private static void Chispa(IMascotCanvas c, MascotState s, double t)
    {
        var body = s switch { MascotState.Error => "#C2665A", MascotState.Sleeping => "#9A6A58", _ => "#E5774A" };
        var core = s switch { MascotState.Error => "#D98A7E", MascotState.Sleeping => "#B58C6E", _ => "#F6B26B" };
        var shade = s == MascotState.Sleeping ? "#7A5244" : "#C25A34";
        const string eye = "#1A1210";
        double ox = 0, oy = 0;
        if (s == MascotState.Idle) oy = Step(t, 2.8, 2) == 0 ? 0 : -1;
        if (s == MascotState.Done) oy = new[] { 0, -2, -3, -1 }[Step(t, .8, 4)];
        if (s == MascotState.Error) ox = Step(t, .25, 2);

        With(c, new Translate(ox, oy), () =>
        {
            var feet = s == MascotState.Running ? Step(t, .4, 2) : 0;
            R(c, 9, 18 - feet, 2, 1, shade);
            R(c, 13, 18 - (s == MascotState.Running ? 1 - feet : 0), 2, 1, shade);

            With(c, new Translate(0, s == MascotState.Permission ? -1 : 0), () =>
            {
                var period = s == MascotState.Running ? .3 : 1.4;
                var flicker = s is MascotState.Idle or MascotState.Running;
                var tipA = s != MascotState.Sleeping && (!flicker || Phase(t, period) < .5);
                var tipB = s != MascotState.Sleeping && flicker && Phase(t, period) >= .5;
                if (tipA) { R(c, 12, 3, 1, 1, body); R(c, 11, 4, 2, 1, body); R(c, 11, 5, 3, 1, body); }
                if (tipB) { R(c, 11, 3, 1, 1, body); R(c, 11, 4, 2, 1, body); R(c, 11, 5, 3, 1, body); R(c, 13, 4, 1, 1, body); }
                R(c, 10, 6, 4, 1, body); R(c, 9, 7, 6, 1, body); R(c, 8, 8, 8, 1, body); R(c, 7, 9, 10, 7, body); R(c, 8, 16, 8, 1, body); R(c, 9, 17, 6, 1, shade);
                Faded(c, s == MascotState.Editing ? Blink(t, .5) : 1, () => { R(c, 11, 12, 2, 1, core); R(c, 10, 13, 4, 3, core); R(c, 11, 16, 2, 1, core); });
            });

            switch (s)
            {
                case MascotState.Done:
                    foreach (var (x, y) in new[] { (9, 11), (10, 10), (11, 11), (12, 11), (13, 10), (14, 11) }) R(c, x, y, 1, 1, eye);
                    break;
                case MascotState.Error:
                    foreach (var (x, y) in new[] { (9, 10), (11, 10), (10, 11), (9, 12), (11, 12), (12, 10), (14, 10), (13, 11), (12, 12), (14, 12) }) R(c, x, y, 1, 1, eye);
                    break;
                case MascotState.Sleeping:
                    R(c, 9, 11, 2, 1, eye); R(c, 13, 11, 2, 1, eye);
                    break;
                default:
                    R(c, 10, 10, 1, 2, eye); R(c, 13, 10, 1, 2, eye);
                    break;
            }

            if (s == MascotState.Reading) { R(c, 2, 12, 4, 3, "#E8ECF4"); R(c, 4, 12, 1, 3, "#98A2B8"); }
            if (s == MascotState.Editing) { R(c, 19, 8, 1, 4, "#FBBF24"); R(c, 19, 12, 1, 1, "#E8ECF4"); }
            if (s == MascotState.Thinking)
                for (var i = 0; i < 3; i++) { var x = 16 + i * 2; Faded(c, Dot(t, 1.2, i * .2), () => R(c, x, 2, 1, 1, "#E8ECF4")); }
            if (s == MascotState.Running)
                Faded(c, Blink(t, .4), () => { R(c, 5, 7, 1, 1, "#F6B26B"); R(c, 18, 5, 1, 1, "#F6B26B"); R(c, 4, 11, 1, 1, "#E5774A"); R(c, 19, 10, 1, 1, "#E5774A"); });
            if (s == MascotState.Permission) Ask(c, 17, 0);
            if (s == MascotState.Done) Faded(c, Blink(t, .5), () => { R(c, 4, 5, 1, 1, "#FBBF24"); R(c, 19, 4, 1, 1, "#FBBF24"); R(c, 6, 2, 1, 1, "#FBBF24"); });
            if (s == MascotState.Sleeping)
            {
                var (dy, opacity) = Float(t, true);
                Faded(c, opacity, () => With(c, new Translate(0, Math.Round(dy)), () =>
                {
                    R(c, 17, 3, 4, 1, "#98A2B8"); R(c, 19, 4, 1, 1, "#98A2B8"); R(c, 18, 5, 1, 1, "#98A2B8"); R(c, 17, 6, 4, 1, "#98A2B8");
                }));
            }
        });
    }

    /// <summary>The amber pixel "?" sign used by Chispa when it asks for permission.</summary>
    private static void Ask(IMascotCanvas c, int x, int y)
    {
        const string dark = "#0A0D14";
        R(c, x, y + 1, 7, 8, "#FBBF24");
        R(c, x + 2, y + 2, 3, 1, dark); R(c, x + 1, y + 3, 1, 1, dark); R(c, x + 5, y + 3, 1, 1, dark);
        R(c, x + 4, y + 4, 1, 1, dark); R(c, x + 3, y + 5, 1, 1, dark); R(c, x + 3, y + 7, 1, 1, dark);
    }

    // ---------- Nodo (Codex): hexagonal network node ----------

    private static void Nodo(IMascotCanvas c, MascotState s, double t)
    {
        var (top, mid, bottom) = StateTriplet(s, ("#B9B4FF", "#7C74F2", "#4B3FD1"), ("#706C98", "#56528A", "#3B3672"));
        var fill = new LinearGradient($"nodo-{s}", 0, 16, 0, 104, (top, 0), (mid, .5), (bottom, 1));
        var port = s switch { MascotState.Permission => "#FBBF24", MascotState.Error => "#F87171", MascotState.Sleeping => "#3A4256", _ => "#C9C2FF" };
        var glyph = Pen("#FFFFFF", 8);
        Shadow(c, 60, 116, 30);

        Transform2D cloud = s switch
        {
            MascotState.Idle => new Scale(1 + .03 * Wave(t, 3.2), 1 + .03 * Wave(t, 3.2), 60, 60),
            MascotState.Running => new Rotate(-6 * Math.Sin(2 * Math.PI * Phase(t, .9)), 60, 60),
            MascotState.Done => Pop(t, 60, 60),
            _ => new Translate(0, 0),
        };
        With(c, cloud, () =>
        {
            var portOpacity = s switch { MascotState.Thinking => Dot(t, 1.2, 0), MascotState.Running => Blink(t, .3), _ => 1 };
            var link = Pen(port, 4);
            Line(c, link, 60, 20, 60, 6); Line(c, link, 95, 80, 107, 87); Line(c, link, 25, 80, 13, 87);
            Faded(c, portOpacity, () => { Circle(c, port, 60, 6, 5.5); Circle(c, port, 107, 87, 5.5); Circle(c, port, 13, 87, 5.5); });
            c.Path("M60,20 L95,40 L95,80 L60,100 L25,80 L25,40 Z", fill, new Stroke(fill, 14));

            switch (s)
            {
                case MascotState.Thinking:
                    for (var i = 0; i < 3; i++) { var x = 45 + i * 15; Faded(c, Dot(t, 1.2, i * .2), () => Circle(c, "#FFFFFF", x, 60, 4.5)); }
                    break;
                case MascotState.Running:
                    Polyline(c, glyph, 36, 48, 47, 60, 36, 72); Polyline(c, glyph, 52, 48, 63, 60, 52, 72);
                    if (Phase(t, 1.1) < .5) Line(c, glyph, 68, 72, 82, 72);
                    break;
                case MascotState.Permission:
                    c.Path("M51,49 q9,-9 18,0 q3,9 -9,12 v5", null, glyph); Circle(c, "#FFFFFF", 60, 76, 4);
                    break;
                case MascotState.Done: Polyline(c, glyph, 44, 60, 55, 71, 76, 48); break;
                case MascotState.Error: Line(c, glyph, 47, 47, 73, 73); Line(c, glyph, 73, 47, 47, 73); break;
                case MascotState.Sleeping: Line(c, glyph, 40, 60, 52, 60); Line(c, glyph, 68, 60, 80, 60); break;
                default:
                    With(c, new Translate(s == MascotState.Reading ? 6 * Wave(t, 1.6) : 0, 0), () => Polyline(c, glyph, 40, 48, 51, 60, 40, 72));
                    if (s == MascotState.Editing) Line(c, glyph, 60, 72, 60 + 18 * new[] { .35, .7, 1 }[Step(t, .45, 3)], 72);
                    else if (Phase(t, 1.1) < .5) Line(c, glyph, 60, 72, 78, 72);
                    break;
            }
        });
        if (s == MascotState.Sleeping) Zz(c, 98, 26, t);
    }

    // ---------- Astro (Antigravity): levitating ringed planetoid ----------

    private static void Astro(IMascotCanvas c, MascotState s, double t)
    {
        var (a1, a2, a3) = StateTriplet(s, ("#FFC2E2", "#F28BC8", "#9B6BE0"), ("#8A7C96", "#76668A", "#584E7E"));
        var fill = new LinearGradient($"astro-{s}", 30, 30, 92, 96, (a1, 0), (a2, .5), (a3, 1));
        var ringColor = s switch { MascotState.Permission => "#FBBF24", MascotState.Error => "#F87171", MascotState.Sleeping => "#6E6585", _ => "#F7A8D6" };
        var glyph = Pen("#FFFFFF", 5);

        var (groundScale, groundOpacity) = s switch
        {
            MascotState.Idle => (1 - .25 * Wave(t, 3.2), 1 - .3 * Wave(t, 3.2)),
            MascotState.Running => (.55, 1),
            MascotState.Error or MascotState.Sleeping => (1.2, 1),
            _ => (1d, 1d),
        };
        Faded(c, groundOpacity, () => c.Ellipse(60, 114, 24 * groundScale, 3.5, S("#8C000000")));

        var lift = s switch { MascotState.Idle => -6 * Wave(t, 3.2), MascotState.Thinking => -4, MascotState.Running => -6, MascotState.Error or MascotState.Sleeping => 8, _ => 0 };
        Transform2D body = s switch
        {
            MascotState.Permission => new Rotate(-6 * Math.Sin(2 * Math.PI * Phase(t, .9)), 60, 62),
            MascotState.Done => Pop(t, 60, 62),
            MascotState.Error => new Rotate(12, 60, 62),
            _ => new Translate(0, 0),
        };

        With(c, new Translate(0, lift), () => With(c, body, () =>
        {
            if (s == MascotState.Running)
                Faded(c, Blink(t, .35), () => { var trail = Pen("#B58CF0", 3); Line(c, trail, 46, 102, 46, 110); Line(c, trail, 60, 104, 60, 114); Line(c, trail, 74, 102, 74, 110); });
            var ring = new Stroke(S(ringColor), 5, Dash: s == MascotState.Running ? [18, 10] : null, DashOffset: s == MascotState.Running ? -28 * Phase(t, .6) : 0);
            var tilt = new Rotate(-16, 60, 62);
            Faded(c, .5, () => With(c, tilt, () => c.Path("M8,62 A52,14 0 0 1 112,62", null, ring)));
            c.Ellipse(60, 62, 33, 33, fill);
            With(c, tilt, () => c.Path("M8,62 A52,14 0 0 0 112,62", null, ring));

            switch (s)
            {
                case MascotState.Thinking:
                    for (var i = 0; i < 3; i++) { var x = 50 + i * 10; Faded(c, Dot(t, 1.2, i * .2), () => Circle(c, "#FFFFFF", x, 56, 3.4)); }
                    break;
                case MascotState.Editing:
                    c.Rect(50, 50, 6, 12, S("#FFFFFF"), 3);
                    if (Phase(t, .8) < .5) Line(c, glyph, 64, 62, 72, 62);
                    break;
                case MascotState.Permission:
                    c.Path("M53,49 q7,-8 14,0 q2,7 -7,10 v4", null, glyph); Circle(c, "#FFFFFF", 60, 68, 2.8);
                    break;
                case MascotState.Done: Polyline(c, glyph, 50, 56, 57, 63, 71, 49); break;
                case MascotState.Error: Line(c, glyph, 52, 49, 68, 65); Line(c, glyph, 68, 49, 52, 65); break;
                case MascotState.Sleeping: Line(c, glyph, 49, 57, 56, 57); Line(c, glyph, 64, 57, 71, 57); break;
                default:
                    With(c, new Translate(s == MascotState.Reading ? 5 * Wave(t, 1.6) : 0, 0), () =>
                    {
                        c.Rect(50, 50, 6, 12, S("#FFFFFF"), 3);
                        c.Rect(64, 50, 6, 12, S("#FFFFFF"), 3);
                    });
                    break;
            }
        }));

        if (s == MascotState.Thinking) With(c, new Rotate(360 * Phase(t, 2.4), 60, 62), () => Circle(c, "#F7A8D6", 104, 40, 5));
        if (s == MascotState.Done) Faded(c, Blink(t, .6), () => { Circle(c, "#FFD27A", 18, 26, 3.5); Circle(c, "#FFD27A", 102, 22, 2.5); Circle(c, "#FFD27A", 106, 94, 3); });
        if (s == MascotState.Sleeping) Zz(c, 96, 24, t);
    }

    // ---------- Hondo (DeepSeek Harness): geometric whale ----------

    private static void Hondo(IMascotCanvas c, MascotState s, double t)
    {
        var (h1, h2, h3) = StateTriplet(s, ("#8FE3F0", "#2FA7C9", "#1F6E9E"), ("#6E98A3", "#4E7486", "#35526A"));
        var fill = new LinearGradient($"hondo-{s}", 0, 34, 0, 96, (h1, 0), (h2, .55), (h3, 1));
        var glyph = Pen("#FFFFFF", 4.5);
        Shadow(c, 62, 110, 36);
        if (s == MascotState.Running) { var wake = Pen("#5CC8F5", 3); Line(c, wake, 2, 94, 14, 94); Line(c, wake, 6, 102, 18, 102); }

        var (dx, dy) = s switch
        {
            MascotState.Idle => (0d, -3 * Wave(t, 4)),
            MascotState.Running => (4 * Wave(t, .8), 0d),
            MascotState.Error => (Step(t, .2, 2), 0d),
            MascotState.Sleeping => (0d, 4d),
            _ => (0d, 0d),
        };
        With(c, new Translate(dx, dy), () =>
        {
            var wag = s switch { MascotState.Editing => -10 * Wave(t, .6), MascotState.Running => -10 * Wave(t, .4), _ => 0 };
            With(c, new Rotate(wag, 34, 66), () =>
                c.Path("M34,64 L20,61 C16,52 8,48 4,51 C8,56 11,61 13,66 C11,71 8,76 4,81 C8,84 16,80 20,71 L34,70 Z", fill, null));
            c.Path("M108,66 C108,46 92,36 70,36 C50,36 36,46 31,60 C29,68 31,78 37,84 C47,94 59,96 71,96 C93,96 108,84 108,66 Z", fill, null);
            Faded(c, .35, () => { var pleat = Pen("#E6FBFF", 2); c.Path("M60,91 Q82,92 100,79", null, pleat); c.Path("M56,85 Q78,87 96,74", null, pleat); });

            switch (s)
            {
                case MascotState.Thinking:
                    for (var i = 0; i < 3; i++) { var x = 78 + i * 9; Faded(c, Dot(t, 1.2, i * .2), () => Circle(c, "#FFFFFF", x, 60, 3)); }
                    break;
                case MascotState.Editing:
                    Circle(c, "#FFFFFF", 88, 58, 4.5);
                    if (Phase(t, .8) < .5) Line(c, glyph, 80, 70, 94, 70);
                    break;
                case MascotState.Running: Polyline(c, glyph, 80, 51, 87, 58, 80, 65); Polyline(c, glyph, 89, 51, 96, 58, 89, 65); break;
                case MascotState.Permission: c.Path("M82,51 q6,-7 12,0 q2,6 -6,9 v3", null, glyph); Circle(c, "#FFFFFF", 88, 68, 2.6); break;
                case MascotState.Done: Polyline(c, glyph, 80, 59, 86, 65, 97, 52); break;
                case MascotState.Error: Line(c, glyph, 82, 52, 94, 64); Line(c, glyph, 94, 52, 82, 64); break;
                case MascotState.Sleeping: Line(c, glyph, 82, 59, 94, 59); break;
                default:
                    With(c, new Translate(s == MascotState.Reading ? 5 * Wave(t, 1.6) : 0, 0), () => Circle(c, "#FFFFFF", 88, 58, 4.5));
                    break;
            }
        });

        if (s == MascotState.Done)
            Faded(c, 1 - .8 * Wave(t, .7), () =>
            {
                var jet = Pen("#9BE2FF", 3);
                c.Path("M78,32 C74,22 68,18 60,18", null, jet); c.Path("M82,32 C86,22 92,18 100,18", null, jet); Line(c, jet, 80, 30, 80, 14);
            });
        if (s == MascotState.Sleeping) Zz(c, 100, 30, t);
    }
}
