using System;
using System.Collections.Generic;
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
public partial class App : Application, IBarCommands
{
    private Mutex? singleInstance;
    private DesktopSettings settings = new();
    private readonly AgentTracker tracker = new();
    private readonly BarViewModel bar = new();
    private IReadOnlyList<AgentInfo>? catalogAgents;
    private ViewPreferences? catalogPreferences;
    private LiveConnection? connection;
    private MainWindow? window;
    private TrayIcon? tray;
    private GlobalHotkey? hotkey;
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
        ApplyAgents();

        var client = new OverseerClient(new HttpClient { Timeout = Timeout.InfiniteTimeSpan }, settings.BaseUri, settings.EventsPath);
        connection = new LiveConnection(client, tracker);
        tracker.Changed += snapshot => Dispatcher.BeginInvoke(() => bar.Slots.FirstOrDefault(slot => slot.Id == snapshot.Agent)?.Update(snapshot));
        connection.CatalogLoaded += (agents, preferences) => Dispatcher.BeginInvoke(() =>
        {
            catalogAgents = agents;
            catalogPreferences = preferences;
            ApplyAgents();
        });
        connection.StatusChanged += status => Dispatcher.BeginInvoke(() => { bar.Status = status; tray?.SetStatus(bar.StatusText); });

        window = new MainWindow(bar, this) { Topmost = settings.Topmost };
        window.PlaceAt(settings.Left, settings.Top);
        window.Moved += (left, top) => SaveSettings(settings with { Left = left, Top = top });
        window.IsVisibleChanged += (_, _) => FrameClock.SetPaused(!window.IsVisible);
        window.Show();

        tray = new TrayIcon(this);
        if (Hotkey.Parse(settings.Hotkey) is { } shortcut)
        {
            hotkey = new GlobalHotkey(window, shortcut, ToggleFromShortcut);
            if (!hotkey.Registered) tray.SetStatus($"{shortcut} está en uso por otra aplicación");
        }
        if (hotkey?.Registered != false) tray.SetStatus(bar.StatusText);

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

    /// <summary>Rebuilds the slots in order, keeping existing view models so an open panel stays open.</summary>
    private void ApplyAgents()
    {
        var agents = AgentCatalog.VisibleAgents(catalogAgents, catalogPreferences, settings.HiddenAgents);
        var existing = bar.Slots.ToDictionary(slot => slot.Id);
        var next = agents.Select(agent => existing.TryGetValue(agent.Id, out var slot) && slot.Name == agent.Name ? slot : new AgentSlotViewModel(agent)).ToList();
        if (bar.Selected is { } selected && !next.Contains(selected)) window?.CloseFlyout(false);
        if (next.SequenceEqual(bar.Slots)) return;
        bar.Slots.Clear();
        foreach (var slot in next) { slot.Update(tracker.Get(slot.Id)); bar.Slots.Add(slot); }
    }

    private void ToggleFromShortcut()
    {
        if (window is null) return;
        if (window.IsVisible && window.IsActive) window.Hide();
        else window.ShowAndFocus();
    }

    // ---------- IBarCommands (tray menu and right-click menu) ----------

    public IReadOnlyList<AgentChoice> AgentChoices => AgentCatalog.Choices(catalogAgents, catalogPreferences, settings.HiddenAgents);

    public void SetAgentVisible(string agent, bool visible)
    {
        var hidden = settings.HiddenAgents.Where(id => id != agent).ToList();
        if (!visible) hidden.Add(agent);
        SaveSettings(settings with { HiddenAgents = hidden });
        ApplyAgents();
    }

    public bool Topmost => settings.Topmost;
    public void SetTopmost(bool value) { if (window is not null) window.Topmost = value; SaveSettings(settings with { Topmost = value }); }
    public bool Calm => FrameClock.Calm;
    public void SetCalm(bool value) { FrameClock.SetCalm(value); SaveSettings(settings with { Calm = value }); }
    public bool BarVisible => window?.IsVisible == true;
    public string? HotkeyText => hotkey?.Registered == true ? Hotkey.Parse(settings.Hotkey)?.ToString() : null;

    public void ToggleBar()
    {
        if (window is null) return;
        if (window.IsVisible) window.Hide();
        else { window.Show(); window.Activate(); }
    }

    public void OpenWeb()
    {
        try { Process.Start(new ProcessStartInfo(settings.BaseUri.ToString()) { UseShellExecute = true }); }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException) { tray?.SetStatus("No se pudo abrir el navegador"); }
    }

    public void Quit() => _ = ExitAsync();

    private void SaveSettings(DesktopSettings next) { settings = next; settings.Save(); }

    private async Task ExitAsync()
    {
        clock?.Stop();
        hotkey?.Dispose();
        tray?.Dispose();
        if (connection is not null) await connection.DisposeAsync();
        Shutdown();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        hotkey?.Dispose();
        tray?.Dispose();
        singleInstance?.Dispose();
        base.OnExit(e);
    }
}
