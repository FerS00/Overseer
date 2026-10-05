using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Overseer.Desktop.Core;

/// <summary>Read-only access to the local Overseer backend.</summary>
public sealed class OverseerClient(HttpClient http, Uri baseUri, string eventsPath = "/events")
{
    public Uri BaseUri { get; } = baseUri;

    /// <summary>Time limit for the JSON requests; the SSE stream itself has none.</summary>
    public static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);

    public Task<List<AgentInfo>?> GetAgentsAsync(CancellationToken ct) => GetAsync<List<AgentInfo>>("/api/agents", ct);
    public Task<ViewPreferences?> GetPreferencesAsync(CancellationToken ct) => GetAsync<ViewPreferences>("/api/preferences", ct);
    public Task<List<AgentEvent>?> GetRecentEventsAsync(int limit, CancellationToken ct) => GetAsync<List<AgentEvent>>($"/api/events?limit={limit}", ct);

    private async Task<T?> GetAsync<T>(string path, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(RequestTimeout);
        return await http.GetFromJsonAsync<T>(new Uri(BaseUri, path), Json.Options, timeout.Token);
    }

    /// <summary>Streams events from the SSE endpoint until the server closes it or <paramref name="ct"/> is cancelled.</summary>
    public async IAsyncEnumerable<(AgentEvent Event, string? Id)> StreamAsync(string? lastEventId, [EnumeratorCancellation] CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(BaseUri, eventsPath));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
        if (!string.IsNullOrEmpty(lastEventId)) request.Headers.Add("Last-Event-ID", lastEventId);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);
        var parser = new SseParser();
        while (!ct.IsCancellationRequested && await reader.ReadLineAsync(ct) is { } line)
        {
            if (parser.Feed(line) is not { } message || message.Event is not ("event" or "message")) continue;
            AgentEvent? parsed;
            try { parsed = JsonSerializer.Deserialize<AgentEvent>(message.Data, Json.Options); }
            catch (JsonException) { continue; }
            if (parsed is not null) yield return (parsed, message.Id);
        }
    }
}
