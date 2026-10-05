using System.Globalization;
using System.Text.RegularExpressions;
using Overseer.Desktop.Core.Drawing;

namespace Overseer.Desktop.Core.Tests;

public class MascotPainterTests
{
    public static IEnumerable<object[]> Cases() =>
        from kind in MascotPainter.Kinds from state in Enum.GetValues<MascotState>() select new object[] { kind, state };

    [Theory]
    [MemberData(nameof(Cases))]
    public void EveryMascotDrawsEveryStateWithBalancedLayersAcrossTheAnimation(string kind, MascotState state)
    {
        for (var t = 0d; t < 4; t += 0.05)
        {
            var canvas = new SvgCanvas();
            MascotPainter.Draw(canvas, kind, state, t, 44);
            Assert.Equal(0, canvas.Depth);
            Assert.Contains("<", canvas.Markup);
        }
    }

    [Fact]
    public void PathDataStaysCultureInvariantOnSpanishWindows()
    {
        var previous = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("es-ES");
            var canvas = new SvgCanvas();
            MascotPainter.Draw(canvas, "nodo", MascotState.Editing, 0.2, 37);
            foreach (Match path in Regex.Matches(canvas.Markup, "d=\"([^\"]*)\"")) Assert.DoesNotMatch(@"\d,\d+\.\d|\d+,\d+,\d", path.Groups[1].Value);
            Assert.Contains("L72.6,72", canvas.Markup);
        }
        finally { CultureInfo.CurrentCulture = previous; }
    }

    [Fact]
    public void StatesThatAnimateChangeOverTimeAndCalmPoseIsStable()
    {
        string Frame(string kind, MascotState state, double t) { var c = new SvgCanvas(); MascotPainter.Draw(c, kind, state, t, 44); return c.Markup; }
        Assert.NotEqual(Frame("chispa", MascotState.Running, 0), Frame("chispa", MascotState.Running, .2));
        Assert.NotEqual(Frame("nodo", MascotState.Thinking, 0), Frame("nodo", MascotState.Thinking, .5));
        Assert.NotEqual(Frame("astro", MascotState.Idle, 0), Frame("astro", MascotState.Idle, 1.6));
        Assert.Equal(Frame("hondo", MascotState.Error, 0), Frame("hondo", MascotState.Error, 0));
    }

    /// <summary>Writes a preview sheet of every mascot and state when OVERSEER_PREVIEW names an output file.</summary>
    [Fact]
    public void WritesPreviewSheetOnRequest()
    {
        var output = Environment.GetEnvironmentVariable("OVERSEER_PREVIEW");
        if (string.IsNullOrEmpty(output)) return;
        var states = Enum.GetValues<MascotState>();
        const int cell = 120;
        var sheet = new System.Text.StringBuilder($"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{states.Length * cell + 110}\" height=\"{MascotPainter.Kinds.Count * cell + 40}\" style=\"background:#0A0D14;font-family:monospace\">");
        for (var s = 0; s < states.Length; s++) sheet.Append($"<text x=\"{110 + s * cell + cell / 2}\" y=\"24\" fill=\"#98A2B8\" font-size=\"13\" text-anchor=\"middle\">{states[s].ToString().ToLowerInvariant()}</text>");
        for (var k = 0; k < MascotPainter.Kinds.Count; k++)
        {
            var kind = MascotPainter.Kinds[k];
            sheet.Append($"<text x=\"10\" y=\"{40 + k * cell + cell / 2}\" fill=\"#E8ECF4\" font-size=\"14\">{kind}</text>");
            for (var s = 0; s < states.Length; s++)
            {
                var canvas = new SvgCanvas();
                MascotPainter.Draw(canvas, kind, states[s], .35, 88);
                sheet.Append($"<g transform=\"translate({110 + s * cell + 16} {40 + k * cell + 16})\"{(kind == "chispa" ? " shape-rendering=\"crispEdges\"" : "")}>{canvas.Markup.Replace("id=\"", $"id=\"{k}{s}").Replace("url(#", $"url(#{k}{s}")}</g>");
            }
        }
        File.WriteAllText(output, sheet.Append("</svg>").ToString());
    }
}
