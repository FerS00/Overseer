namespace Overseer.Desktop.Core;

/// <summary>What the bar shows for one agent.</summary>
public sealed record AgentSnapshot(
    string Agent, MascotState State, string? Activity, string? Tool, string? Title, string? Detail,
    ActivityTarget? Target, DateTimeOffset StateSince, DateTimeOffset? LastEventAt, string? SessionId)
{
    public static AgentSnapshot Empty(string agent) => new(agent, MascotState.Idle, null, null, null, null, null, DateTimeOffset.MinValue, null, null);
    public string Label => Activity is not null && State is not MascotState.Permission and not MascotState.Error ? MascotLabels.Activities[Activity].Long : MascotLabels.Long(State);
    public string ShortLabel => Activity is not null && State is not MascotState.Permission and not MascotState.Error ? MascotLabels.Activities[Activity].Short : MascotLabels.Short(State);
}

/// <summary>
/// Keeps the newest state per agent, like MascotStateService in the web app: older events never overwrite newer ones,
/// done turns into idle after 3 s and any agent sleeps after 10 minutes without events.
/// </summary>
public sealed class AgentTracker
{
    public static readonly TimeSpan DoneDuration = TimeSpan.FromSeconds(3);
    public static readonly TimeSpan SleepAfter = TimeSpan.FromMinutes(10);
    private readonly Dictionary<string, AgentSnapshot> snapshots = new();
    private readonly Dictionary<string, (DateTimeOffset Ts, long Id)> latest = new();
    private readonly object gate = new();

    public event Action<AgentSnapshot>? Changed;

    public AgentSnapshot Get(string agent) { lock (gate) return snapshots.TryGetValue(agent, out var value) ? value : AgentSnapshot.Empty(agent); }

    /// <summary>Applies an event. Returns false when it is older than what the agent already shows or unknown.</summary>
    public bool Consume(AgentEvent e, DateTimeOffset? now = null)
    {
        if (!AgentCatalog.IsKnown(e.Agent)) return false;
        var at = e.Timestamp ?? now ?? DateTimeOffset.UtcNow;
        AgentSnapshot next;
        lock (gate)
        {
            if (latest.TryGetValue(e.Agent, out var previous) && (at < previous.Ts || at == previous.Ts && (e.Id ?? long.MaxValue) <= previous.Id)) return false;
            latest[e.Agent] = (at, e.Id ?? 0);
            var state = EventClassifier.Classify(e);
            var activity = EventClassifier.ClassifyActivity(e, state);
            var current = snapshots.TryGetValue(e.Agent, out var value) ? value : AgentSnapshot.Empty(e.Agent);
            var since = current.State == state && current.Activity == activity && current.StateSince != DateTimeOffset.MinValue ? current.StateSince : at;
            next = new AgentSnapshot(e.Agent, state, activity, EventClassifier.ToolOf(e) is { Length: > 0 } tool ? tool : null, e.Title, e.Detail,
                EventClassifier.DescribeTarget(e, activity), since, at, e.SessionId ?? current.SessionId);
            snapshots[e.Agent] = next;
        }
        Changed?.Invoke(next);
        return true;
    }

    /// <summary>Applies time-based transitions. Call about once per second.</summary>
    public void Tick(DateTimeOffset now)
    {
        List<AgentSnapshot> changed = [];
        lock (gate)
        {
            foreach (var (agent, snapshot) in snapshots.ToList())
            {
                var next = snapshot;
                if (snapshot.LastEventAt is { } last && now - last >= SleepAfter && snapshot.State != MascotState.Sleeping)
                    next = snapshot with { State = MascotState.Sleeping, Activity = null, Target = null, StateSince = last + SleepAfter };
                else if (snapshot.State == MascotState.Done && now - snapshot.StateSince >= DoneDuration)
                    next = snapshot with { State = MascotState.Idle, Activity = null, Target = null, StateSince = snapshot.StateSince + DoneDuration };
                if (next == snapshot) continue;
                snapshots[agent] = next;
                changed.Add(next);
            }
        }
        foreach (var snapshot in changed) Changed?.Invoke(snapshot);
    }
}
