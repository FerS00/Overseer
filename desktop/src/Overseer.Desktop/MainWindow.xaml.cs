using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using Overseer.Desktop.Rendering;

namespace Overseer.Desktop;

/// <summary>
/// Borderless, always-on-top bar with one button per mascot. Dragging the bar background moves it;
/// a mascot opens its panel, which unfolds downwards from the bar.
/// </summary>
public partial class MainWindow : Window
{
    private static readonly Duration Unfold = new(TimeSpan.FromMilliseconds(240));
    private readonly BarViewModel model;
    private Button? lastSlot;

    public event Action<double, double>? Moved;
    public event Action? OpenWebRequested;

    public MainWindow(BarViewModel model)
    {
        InitializeComponent();
        this.model = model;
        DataContext = model;
        Bar.SizeChanged += (_, _) => KeepCentered();
    }

    /// <summary>Restores a saved position if it is still on a screen; otherwise uses the top center of the primary work area.</summary>
    public void PlaceAt(double? left, double? top)
    {
        var area = SystemParameters.WorkArea;
        var onScreen = left is { } l && top is { } t
            && l >= SystemParameters.VirtualScreenLeft - Width / 2 && l <= SystemParameters.VirtualScreenLeft + SystemParameters.VirtualScreenWidth - Width / 2
            && t >= SystemParameters.VirtualScreenTop && t <= SystemParameters.VirtualScreenTop + SystemParameters.VirtualScreenHeight - 60;
        Left = onScreen ? left!.Value : area.Left + (area.Width - Width) / 2;
        Top = onScreen ? top!.Value : area.Top;
    }

    /// <summary>The window grows when agents are added; keep the bar where the user left it.</summary>
    private void KeepCentered()
    {
        var needed = Math.Max(388, Bar.ActualWidth + 24);
        if (Math.Abs(needed - Width) < 1) return;
        Left -= (needed - Width) / 2;
        Width = needed;
    }

    private void OnBarMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton != MouseButton.Left || e.ButtonState != MouseButtonState.Pressed) return;
        var before = (Left, Top);
        DragMove();
        if (before != (Left, Top)) Moved?.Invoke(Left, Top);
    }

    private void OnSlotClick(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { DataContext: AgentSlotViewModel slot } button) return;
        lastSlot = button;
        if (model.Selected == slot) CloseFlyout(true);
        else OpenFlyout(slot);
    }

    private void OpenFlyout(AgentSlotViewModel slot)
    {
        var wasOpen = model.Selected is not null;
        model.Selected = slot;
        FlyoutHost.Visibility = Visibility.Visible;
        Flyout.Measure(new Size(Flyout.Width, double.PositiveInfinity));
        var target = Flyout.DesiredSize.Height + Flyout.Margin.Top;
        if (wasOpen || FrameClock.Calm) { FlyoutHost.BeginAnimation(HeightProperty, null); FlyoutHost.Height = double.NaN; return; }

        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        var grow = new DoubleAnimation(0, target, Unfold) { EasingFunction = ease };
        // Once unfolded, let the panel size itself so live updates can change its height.
        grow.Completed += (_, _) => { if (model.Selected == slot) { FlyoutHost.BeginAnimation(HeightProperty, null); FlyoutHost.Height = double.NaN; } };
        FlyoutHost.BeginAnimation(HeightProperty, grow);
        Flyout.BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, Unfold));
        FlyoutOffset.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(-10, 0, Unfold) { EasingFunction = ease });
    }

    public void CloseFlyout(bool returnFocus)
    {
        if (model.Selected is null) return;
        var slot = model.Selected;
        model.Selected = null;
        if (returnFocus) lastSlot?.Focus();
        if (FrameClock.Calm) { Collapse(); return; }
        var shrink = new DoubleAnimation(FlyoutHost.ActualHeight, 0, new Duration(TimeSpan.FromMilliseconds(180))) { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseIn } };
        shrink.Completed += (_, _) => { if (model.Selected is null) Collapse(); };
        // Keep showing the closing agent while the panel folds away.
        Flyout.DataContext = slot;
        FlyoutHost.BeginAnimation(HeightProperty, shrink);
    }

    private void Collapse()
    {
        FlyoutHost.BeginAnimation(HeightProperty, null);
        FlyoutHost.Height = 0;
        FlyoutHost.Visibility = Visibility.Collapsed;
        Flyout.ClearValue(DataContextProperty);
        Flyout.SetBinding(DataContextProperty, nameof(BarViewModel.Selected));
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape && model.Selected is not null) { CloseFlyout(true); e.Handled = true; }
        if (e.Key is Key.Left or Key.Right && Keyboard.FocusedElement is Button { DataContext: AgentSlotViewModel slot })
        {
            var buttons = FindSlotButtons();
            var index = buttons.FindIndex(button => button.DataContext == slot);
            if (index < 0) return;
            buttons[(index + (e.Key == Key.Right ? 1 : buttons.Count - 1)) % buttons.Count].Focus();
            e.Handled = true;
        }
    }

    private System.Collections.Generic.List<Button> FindSlotButtons() =>
        model.Slots.Select(slot => SlotList.ItemContainerGenerator.ContainerFromItem(slot) as ContentPresenter)
            .Select(presenter => presenter is null ? null : VisualTreeHelper.GetChildrenCount(presenter) > 0 ? VisualTreeHelper.GetChild(presenter, 0) as Button : null)
            .OfType<Button>().ToList();

    private void OnOpenWeb(object sender, RoutedEventArgs e) => OpenWebRequested?.Invoke();
    private void OnCloseFlyout(object sender, RoutedEventArgs e) => CloseFlyout(true);
}
