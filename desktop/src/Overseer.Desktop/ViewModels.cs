using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Media;
using Overseer.Desktop.Core;

namespace Overseer.Desktop;

public abstract class Observable : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;
    protected void Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (Equals(field, value)) return;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
    protected void Raise(string name) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}

/// <summary>One mascot slot of the bar and the content of its flyout.</summary>
public sealed class AgentSlotViewModel(AgentInfo agent) : Observable
{
    private AgentSnapshot snapshot = AgentSnapshot.Empty(agent.Id);
    private DateTimeOffset now = DateTimeOffset.UtcNow;
    private bool selected;

    public string Id => agent.Id;
    public string Name => agent.Name;
    public string Kind => agent.Mascot;
    public string MascotName => AgentCatalog.MascotNames.TryGetValue(agent.Mascot, out var name) ? name : agent.Mascot;
    public Brush Accent { get; } = Freeze(new SolidColorBrush((Color)ColorConverter.ConvertFromString(agent.Color)));

    public MascotState State => snapshot.State;
    public string StateLabel => MascotLabels.Long(snapshot.State);
    public string ShortLabel => snapshot.ShortLabel;
    public string ActivityLabel => snapshot.Label;
    public string Tool => snapshot.Tool ?? "—";
    public bool HasTool => snapshot.Tool is not null;
    public string TargetKind => snapshot.Target is { } target ? MascotLabels.TargetKinds[target.Kind] : "DETALLE";
    public string TargetText => snapshot.Target is { } target
        ? target.Kind == "file" ? EventClassifier.MiddleEllipsis(target.Text, 52) : target.Text
        : FirstLine(snapshot.Detail) is { Length: > 0 } detail ? detail : snapshot.Title ?? "Sin actividad todavía";
    public string Session => snapshot.SessionId is { Length: > 14 } id ? id[..13] + "…" : snapshot.SessionId ?? "—";
    public string SinceText => snapshot.StateSince == DateTimeOffset.MinValue ? "—" : Duration(now - snapshot.StateSince);
    public string LastText => snapshot.LastEventAt is { } last ? $"hace {Duration(now - last)}" : "Sin eventos";
    public string AutomationName => $"{MascotName}, {Name}: {ActivityLabel.ToLowerInvariant()}";
    public Brush StateBrush => Freeze(new SolidColorBrush((Color)ColorConverter.ConvertFromString(snapshot.State switch
    {
        MascotState.Thinking => "#A99BFF",
        MascotState.Reading or MascotState.Editing or MascotState.Running or MascotState.Done => "#4ADE80",
        MascotState.Permission => "#FBBF24",
        MascotState.Error => "#F87171",
        _ => "#98A2B8",
    })));

    public bool IsSelected { get => selected; set => Set(ref selected, value); }

    public void Update(AgentSnapshot next)
    {
        snapshot = next;
        foreach (var name in new[] { nameof(State), nameof(StateLabel), nameof(ShortLabel), nameof(ActivityLabel), nameof(Tool), nameof(HasTool),
            nameof(TargetKind), nameof(TargetText), nameof(Session), nameof(SinceText), nameof(LastText), nameof(AutomationName), nameof(StateBrush) })
            Raise(name);
    }

    public void Tick(DateTimeOffset value)
    {
        now = value;
        Raise(nameof(SinceText));
        Raise(nameof(LastText));
    }

    public static string Duration(TimeSpan span)
    {
        var seconds = Math.Max(0, (long)span.TotalSeconds);
        if (seconds < 60) return $"{seconds} s";
        var minutes = seconds / 60;
        return minutes < 60 ? $"{minutes} min {seconds % 60:00} s" : $"{minutes / 60} h {minutes % 60:00} min";
    }

    private static string FirstLine(string? text) => (text ?? "").Split('\n')[0].Trim();
    private static Brush Freeze(Brush brush) { brush.Freeze(); return brush; }
}

public sealed class BarViewModel : Observable
{
    private ConnectionStatus status = ConnectionStatus.Connecting;
    private AgentSlotViewModel? selected;

    public ObservableCollection<AgentSlotViewModel> Slots { get; } = [];

    public AgentSlotViewModel? Selected
    {
        get => selected;
        set
        {
            if (selected is not null) selected.IsSelected = false;
            Set(ref selected, value);
            if (value is not null) value.IsSelected = true;
        }
    }

    public ConnectionStatus Status { get => status; set { Set(ref status, value); Raise(nameof(StatusText)); Raise(nameof(StatusBrush)); } }
    public string StatusText => status switch { ConnectionStatus.Live => "En vivo", ConnectionStatus.Connecting => "Conectando…", _ => "Sin conexión con Overseer" };
    public Brush StatusBrush => new SolidColorBrush((Color)ColorConverter.ConvertFromString(status switch
    {
        ConnectionStatus.Live => "#4ADE80", ConnectionStatus.Connecting => "#FBBF24", _ => "#F87171",
    }));
}
