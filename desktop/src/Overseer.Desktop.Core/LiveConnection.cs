namespace Overseer.Desktop.Core;

/// <summary>
/// Background service: loads agents, preferences and recent history, then follows the SSE stream.
/// Reconnects with exponential backoff (1 s to 30 s) and resumes with Last-Event-ID. Raises its events on a worker thread.
/// </summary>
public sealed class LiveConnection(OverseerClient client, AgentTracker tracker) : IAsyncDisposable
{
    private CancellationTokenSource? cts;
    private Task? loop;
    private string? lastEventId;

    public ConnectionStatus Status { get; private set; } = ConnectionStatus.Connecting;
    public event Action<ConnectionStatus>? StatusChanged;
    public event Action<IReadOnlyList<AgentInfo>?, ViewPreferences?>? CatalogLoaded;
    public event Action<AgentEvent>? EventReceived;

    public void Start()
    {
        if (loop is not null) return;
        cts = new CancellationTokenSource();
        loop = Task.Run(() => RunAsync(cts.Token));
    }

    /// <summary>Reloads agents and preferences, for example after changing them in the web app.</summary>
    public Task RefreshCatalogAsync(CancellationToken ct = default) => LoadCatalogAsync(ct);

    private async Task RunAsync(CancellationToken ct)
    {
        var delay = TimeSpan.FromSeconds(1);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                SetStatus(ConnectionStatus.Connecting);
                await LoadCatalogAsync(ct);
                if (lastEventId is null) await SeedAsync(ct);
                await foreach (var (agentEvent, id) in client.StreamAsync(lastEventId, ct))
                {
                    SetStatus(ConnectionStatus.Live);
                    delay = TimeSpan.FromSeconds(1);
                    if (id is not null) lastEventId = id;
                    if (tracker.Consume(agentEvent)) EventReceived?.Invoke(agentEvent);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch (Exception) { /* backend stopped or unreachable: retry below */ }
            SetStatus(ConnectionStatus.Offline);
            try { await Task.Delay(delay, ct); } catch (OperationCanceledException) { return; }
            delay = TimeSpan.FromSeconds(Math.Min(30, delay.TotalSeconds * 2));
        }
    }

    private async Task LoadCatalogAsync(CancellationToken ct)
    {
        var agents = await client.GetAgentsAsync(ct);
        ViewPreferences? preferences = null;
        try { preferences = await client.GetPreferencesAsync(ct); } catch (HttpRequestException) { /* older backend: default order */ }
        CatalogLoaded?.Invoke(agents, preferences);
        SetStatus(Status == ConnectionStatus.Offline ? ConnectionStatus.Connecting : Status);
    }

    private async Task SeedAsync(CancellationToken ct)
    {
        var history = await client.GetRecentEventsAsync(200, ct) ?? [];
        foreach (var agentEvent in history.OrderBy(item => item.Timestamp).ThenBy(item => item.Id)) tracker.Consume(agentEvent);
        if (history.Count > 0) SetStatus(ConnectionStatus.Live);
    }

    private void SetStatus(ConnectionStatus status)
    {
        if (Status == status) return;
        Status = status;
        StatusChanged?.Invoke(status);
    }

    public async ValueTask DisposeAsync()
    {
        if (cts is null) return;
        cts.Cancel();
        try { if (loop is not null) await loop; } catch (OperationCanceledException) { }
        cts.Dispose();
    }
}
