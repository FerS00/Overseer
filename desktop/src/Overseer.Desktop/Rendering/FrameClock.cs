using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Windows.Media;

namespace Overseer.Desktop.Rendering;

/// <summary>
/// The single animation loop of the app, like MascotEngine in the web version: one CompositionTarget.Rendering
/// handler (display rate, normally 60 fps) redraws every registered mascot. It stops when nothing is registered,
/// the bar is hidden or calm mode is on.
/// </summary>
public static class FrameClock
{
    private static readonly HashSet<MascotView> views = [];
    private static readonly Stopwatch watch = Stopwatch.StartNew();
    private static bool attached;
    private static bool paused;
    private static bool calm;

    /// <summary>Seconds since start; frozen at 0 in calm mode so every mascot shows its static pose.</summary>
    public static double Time => calm ? 0 : watch.Elapsed.TotalSeconds;
    public static bool Calm => calm;

    public static void Register(MascotView view) { views.Add(view); Sync(); }
    public static void Unregister(MascotView view) { views.Remove(view); Sync(); }

    public static void SetPaused(bool value) { paused = value; Sync(); }

    public static void SetCalm(bool value)
    {
        calm = value;
        foreach (var view in views) view.InvalidateVisual();
        Sync();
    }

    private static void Sync()
    {
        var run = views.Count > 0 && !paused && !calm;
        if (run == attached) return;
        if (run) CompositionTarget.Rendering += OnRendering;
        else CompositionTarget.Rendering -= OnRendering;
        attached = run;
    }

    private static void OnRendering(object? sender, EventArgs e)
    {
        foreach (var view in views) view.InvalidateVisual();
    }
}
