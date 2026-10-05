using System;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using Overseer.Desktop.Core;
using Overseer.Desktop.Rendering;

namespace Overseer.Desktop;

/// <summary>Starts the bar, the tray icon and the background connection to the local Overseer backend.</summary>
public partial class App : Application
{
    private Mutex? singleInstance;
    private DesktopSettings settings = new();
    private readonly AgentTracker tracker = new();
    private readonly BarViewModel bar = new();
    private LiveConnection? connection;
    private MainWindow? window;
    private TrayIcon? tray;
    private DispatcherTimer? clock;
    private int refreshTicks;
    private bool demo;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        singleInstance = new Mutex(true, "Overseer.Desktop.SingleInstance", out var first);
        if (!first) { Shutdown(); return; }

        settings = DesktopSettings.Load();
        demo = e.Args.Contains("--demo", StringComparer.OrdinalIgnoreCase);
        FrameClock.SetCalm(settings.Calm || !SystemParameters.ClientAreaAnimation);
        SetAgents(AgentCatalog.VisibleAgents(null, null));

        var client = new OverseerClient(new HttpClient { Timeout = Timeout.InfiniteTimeSpan }, settings.BaseUri, settings.EventsPath);
        connection = new LiveConnection(client, tracker);
        tracker.Changed += snapshot => Dispatcher.BeginInvoke(() => bar.Slots.FirstOrDefault(slot => slot.Id == snapshot.Agent)?.Update(snapshot));
        connection.CatalogLoaded += (agents, preferences) => Dispatcher.BeginInvoke(() => SetAgents(AgentCatalog.VisibleAgents(agents, preferences)));
        connection.StatusChanged += status => Dispatcher.BeginInvoke(() => { bar.Status = status; tray?.SetStatus(bar.StatusText); });

        window = new MainWindow(bar) { Topmost = settings.Topmost };
        window.PlaceAt(settings.Left, settings.Top);
        window.Moved += (left, top) => SaveSettings(settings with { Left = left, Top = top });
        window.OpenWebRequested += OpenWeb;
        window.IsVisibleChanged += (_, _) => { FrameClock.SetPaused(!window.IsVisible); tray?.SetBarVisible(window.IsVisible); };
        window.Show();

        tray = new TrayIcon(settings.Topmost, FrameClock.Calm)
        {
            ToggleBar = ToggleBar,
            SetTopmost = value => { window.Topmost = value; SaveSettings(settings with { Topmost = value }); },
            SetCalm = value => { FrameClock.SetCalm(value); SaveSettings(settings with { Calm = value }); },
            OpenWeb = OpenWeb,
            Exit = () => _ = ExitAsync(),
        };
        tray.SetStatus(bar.StatusText);

        clock = new DispatcherTimer(TimeSpan.FromSeconds(1), DispatcherPriority.Background, (_, _) => OnClock(), Dispatcher);
        clock.Start();
        if (demo) { bar.Status = ConnectionStatus.Live; tray.SetStatus("datos de ejemplo"); }
        else connection.Start();
    }

    private void OnClock()
    {
        var now = DateTimeOffset.UtcNow;
        if (demo && refreshTicks % 2 == 0) tracker.Consume(DemoFeed.At(refreshTicks / 2, now));
        tracker.Tick(now);
        foreach (var slot in bar.Slots) slot.Tick(now);
        // Pick up agent order and dock visibility changed from the web app.
        if (++refreshTicks % 30 == 0 && !demo && bar.Status == ConnectionStatus.Live && connection is not null)
            _ = connection.RefreshCatalogAsync().ContinueWith(task => _ = task.Exception, TaskContinuationOptions.OnlyOnFaulted);
    }

    /// <summary>Rebuilds the slots in the given order, keeping existing view models so the flyout stays open.</summary>
    private void SetAgents(System.Collections.Generic.IReadOnlyList<AgentInfo> agents)
    {
        var existing = bar.Slots.ToDictionary(slot => slot.Id);
        var next = agents.Select(agent => existing.TryGetValue(agent.Id, out var slot) && slot.Name == agent.Name ? slot : new AgentSlotViewModel(agent)).ToList();
        if (bar.Selected is { } selected && !next.Contains(selected)) window?.CloseFlyout(false);
        if (next.SequenceEqual(bar.Slots)) return;
        bar.Slots.Clear();
        foreach (var slot in next) { slot.Update(tracker.Get(slot.Id)); bar.Slots.Add(slot); }
    }

    private void ToggleBar()
    {
        if (window is null) return;
        if (window.IsVisible) window.Hide();
        else { window.Show(); window.Activate(); }
    }

    private void OpenWeb()
    {
        try { Process.Start(new ProcessStartInfo(settings.BaseUri.ToString()) { UseShellExecute = true }); }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException) { tray?.SetStatus("No se pudo abrir el navegador"); }
    }

    private void SaveSettings(DesktopSettings next) { settings = next; settings.Save(); }

    private async Task ExitAsync()
    {
        clock?.Stop();
        tray?.Dispose();
        if (connection is not null) await connection.DisposeAsync();
        Shutdown();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        tray?.Dispose();
        singleInstance?.Dispose();
        base.OnExit(e);
    }
}
