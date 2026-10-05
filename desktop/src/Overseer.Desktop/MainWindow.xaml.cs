using System;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using Overseer.Desktop.Rendering;

namespace Overseer.Desktop;

/// <summary>
/// Borderless, always-on-top bar with one button per mascot. Dragging the bar background moves it;
/// a mascot opens its panel, which unfolds downwards from the bar.
/// </summary>
public partial class MainWindow : Window
{
    private const double MinWindowWidth = 388;
    private const double MaxFlyoutHeight = 400;
    private const double OuterMargin = 24;
    private static readonly Duration Unfold = new(TimeSpan.FromMilliseconds(240));
    private readonly BarViewModel model;
    private readonly IBarCommands commands;
    private readonly DispatcherTimer copyReset;
    private Button? lastSlot;

    public event Action<double, double>? Moved;

    public MainWindow(BarViewModel model, IBarCommands commands)
    {
        InitializeComponent();
        this.model = model;
        this.commands = commands;
        DataContext = model;
        Bar.SizeChanged += (_, _) => UpdateWidth();
        Flyout.SizeChanged += (_, _) => UpdateWidth();
        copyReset = new DispatcherTimer(TimeSpan.FromSeconds(1.5), DispatcherPriority.Background, (_, _) => ResetCopyButton(), Dispatcher) { IsEnabled = false };
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

    /// <summary>Shows the bar and moves keyboard focus to the first mascot, for the global shortcut.</summary>
    public void ShowAndFocus()
    {
        Show();
        Activate();
        FindSlotButtons().FirstOrDefault()?.Focus();
    }

    /// <summary>
    /// The window is as wide as the bar or the open panel (up to its 520 px limit), whichever is wider.
    /// Width changes keep the bar's center where the user left it.
    /// </summary>
    private void UpdateWidth()
    {
        var flyout = model.Selected is null ? 0 : Flyout.ActualWidth;
        var needed = Math.Max(MinWindowWidth, Math.Max(Bar.ActualWidth, flyout) + OuterMargin);
        if (Math.Abs(needed - Width) < 1) return;
        Left -= (needed - Width) / 2;
        Width = needed;
    }

    /// <summary>The panel never grows past the bottom of the screen the bar is on.</summary>
    private void LimitFlyoutHeight()
    {
        var area = SystemParameters.WorkArea;
        var barBottom = Top + Bar.TranslatePoint(new Point(0, Bar.ActualHeight), this).Y;
        var available = area.Bottom - barBottom - Flyout.Margin.Top - 24;
        Flyout.MaxHeight = Math.Max(160, Math.Min(MaxFlyoutHeight, available));
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
        ResetCopyButton();
        LimitFlyoutHeight();
        FlyoutScroll.ScrollToTop();
        FlyoutHost.Visibility = Visibility.Visible;
        Flyout.Measure(new Size(Flyout.MaxWidth, Flyout.MaxHeight));
        var target = Flyout.DesiredSize.Height + Flyout.Margin.Top;
        if (wasOpen || FrameClock.Calm) { FlyoutHost.BeginAnimation(HeightProperty, null); FlyoutHost.Height = double.NaN; return; }

        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        var grow = new DoubleAnimation(0, target, Unfold) { EasingFunction = ease };
        // Once unfolded, let the panel size itself so live updates can change its height (within MaxHeight).
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
        UpdateWidth();
    }

    /// <summary>Clicking anywhere outside the bar (another window or the desktop) folds the panel away.</summary>
    private void OnDeactivated(object? sender, EventArgs e) => CloseFlyout(false);

    private void OnCopy(object sender, RoutedEventArgs e)
    {
        if (model.Selected is not { CanCopy: true } slot) return;
        try
        {
            Clipboard.SetText(slot.CopyText);
            CopyButton.Content = "Copiado";
        }
        catch (ExternalException)
        {
            // Another program is holding the clipboard.
            CopyButton.Content = "Reintenta";
        }
        copyReset.Stop();
        copyReset.Start();
    }

    private void ResetCopyButton() { copyReset.Stop(); CopyButton.Content = "Copiar"; }

    /// <summary>Builds the right-click menu each time so it reflects the current agents and options.</summary>
    private void OnBarMenuOpening(object sender, ContextMenuEventArgs e)
    {
        var menu = Bar.ContextMenu!;
        menu.Items.Clear();
        menu.Items.Add(new MenuItem { Header = new TextBlock { Text = "AGENTES VISIBLES", Style = (Style)FindResource("MenuSection") }, IsHitTestVisible = false, Focusable = false });
        var choices = commands.AgentChoices;
        if (choices.Count == 0) menu.Items.Add(new MenuItem { Header = "Ningún agente detectado", IsEnabled = false });
        foreach (var choice in choices)
        {
            var item = new MenuItem
            {
                Header = choice.HiddenInWeb ? $"{choice.Agent.Name} · oculto en la web" : choice.Agent.Name,
                IsCheckable = true, IsChecked = choice.Shown, IsEnabled = !choice.HiddenInWeb, StaysOpenOnClick = true,
                ToolTip = choice.HiddenInWeb ? "Actívalo en Ajustes de vista de la web" : null,
            };
            var id = choice.Agent.Id;
            item.Click += (_, _) => commands.SetAgentVisible(id, item.IsChecked);
            menu.Items.Add(item);
        }
        menu.Items.Add(new Separator());
        var topmost = new MenuItem { Header = "Siempre visible", IsCheckable = true, IsChecked = commands.Topmost };
        topmost.Click += (_, _) => commands.SetTopmost(topmost.IsChecked);
        var calm = new MenuItem { Header = "Modo calma", IsCheckable = true, IsChecked = commands.Calm };
        calm.Click += (_, _) => commands.SetCalm(calm.IsChecked);
        var web = new MenuItem { Header = "Abrir versión web" };
        web.Click += (_, _) => commands.OpenWeb();
        var hide = new MenuItem { Header = "Ocultar barra", InputGestureText = commands.HotkeyText ?? "" };
        hide.Click += (_, _) => commands.ToggleBar();
        var exit = new MenuItem { Header = "Salir" };
        exit.Click += (_, _) => commands.Quit();
        foreach (var item in new Control[] { topmost, calm, web, hide }) menu.Items.Add(item);
        menu.Items.Add(new Separator());
        menu.Items.Add(exit);
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

    private void OnOpenWeb(object sender, RoutedEventArgs e) => commands.OpenWeb();
    private void OnCloseFlyout(object sender, RoutedEventArgs e) => CloseFlyout(true);
}
