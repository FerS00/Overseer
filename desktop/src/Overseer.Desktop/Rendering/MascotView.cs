using System;
using System.Windows;
using System.Windows.Media;
using Overseer.Desktop.Core;
using Overseer.Desktop.Core.Drawing;

namespace Overseer.Desktop.Rendering;

/// <summary>Draws one mascot (chispa, nodo, astro, hondo) in a given state with <see cref="MascotPainter"/>.</summary>
public sealed class MascotView : FrameworkElement
{
    public static readonly DependencyProperty KindProperty = DependencyProperty.Register(nameof(Kind), typeof(string), typeof(MascotView),
        new FrameworkPropertyMetadata("chispa", FrameworkPropertyMetadataOptions.AffectsRender, OnKindChanged));
    public static readonly DependencyProperty StateProperty = DependencyProperty.Register(nameof(State), typeof(MascotState), typeof(MascotView),
        new FrameworkPropertyMetadata(MascotState.Idle, FrameworkPropertyMetadataOptions.AffectsRender));

    public string Kind { get => (string)GetValue(KindProperty); set => SetValue(KindProperty, value); }
    public MascotState State { get => (MascotState)GetValue(StateProperty); set => SetValue(StateProperty, value); }

    public MascotView()
    {
        Loaded += (_, _) => FrameClock.Register(this);
        Unloaded += (_, _) => FrameClock.Unregister(this);
        RenderOptions.SetEdgeMode(this, EdgeMode.Aliased);
    }

    private static void OnKindChanged(DependencyObject d, DependencyPropertyChangedEventArgs e) =>
        // Pixel mascots need crisp cells; the flat ones need antialiasing.
        RenderOptions.SetEdgeMode(d, (string)e.NewValue == "chispa" ? EdgeMode.Aliased : EdgeMode.Unspecified);

    protected override void OnRender(DrawingContext dc)
    {
        var size = Math.Min(ActualWidth, ActualHeight);
        if (size <= 0) return;
        dc.PushTransform(new TranslateTransform((ActualWidth - size) / 2, (ActualHeight - size) / 2));
        MascotPainter.Draw(new WpfCanvas(dc), Kind, State, FrameClock.Time, size);
        dc.Pop();
    }
}
