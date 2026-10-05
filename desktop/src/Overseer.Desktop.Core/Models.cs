using System.Text.Json;
using System.Text.Json.Serialization;

namespace Overseer.Desktop.Core;

/// <summary>Normalized event as served by <c>GET /api/events</c> and the <c>/events</c> SSE stream.</summary>
public sealed record AgentEvent
{
    [JsonPropertyName("id")] public long? Id { get; init; }
    [JsonPropertyName("uid")] public string? Uid { get; init; }
    [JsonPropertyName("ts")] public string Ts { get; init; } = "";
    [JsonPropertyName("agent")] public string Agent { get; init; } = "";
    [JsonPropertyName("session_id")] public string? SessionId { get; init; }
    [JsonPropertyName("parent_session_id")] public string? ParentSessionId { get; init; }
    [JsonPropertyName("type")] public string Type { get; init; } = "";
    [JsonPropertyName("status")] public string? Status { get; init; }
    [JsonPropertyName("title")] public string? Title { get; init; }
    [JsonPropertyName("detail")] public string? Detail { get; init; }
    [JsonPropertyName("tool")] public string? Tool { get; init; }
    [JsonPropertyName("meta")] public Dictionary<string, JsonElement>? Meta { get; init; }

    public DateTimeOffset? Timestamp => DateTimeOffset.TryParse(Ts, out var value) ? value : null;

    /// <summary>Reads a meta field as text; arrays are joined with spaces (Codex sends commands as arrays).</summary>
    public string? MetaText(string key)
    {
        if (Meta is null || !Meta.TryGetValue(key, out var value)) return null;
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Array => string.Join(' ', value.EnumerateArray().Select(item => item.ValueKind == JsonValueKind.String ? item.GetString() : item.ToString())),
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            _ => value.ToString(),
        };
    }
}

/// <summary>Entry of <c>GET /api/agents</c>.</summary>
public sealed record AgentInfo
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("name")] public string Name { get; init; } = "";
    [JsonPropertyName("mascot")] public string Mascot { get; init; } = "";
    [JsonPropertyName("color")] public string Color { get; init; } = "#98A2B8";
    [JsonPropertyName("detected")] public bool? Detected { get; init; }
}

/// <summary>Subset of <c>GET /api/preferences</c> the desktop bar uses. The dock fields are shared with the web dock view.</summary>
public sealed record ViewPreferences
{
    [JsonPropertyName("agentOrder")] public List<string> AgentOrder { get; init; } = [];
    [JsonPropertyName("dockHiddenAgents")] public List<string> DockHiddenAgents { get; init; } = [];
}

public enum ConnectionStatus { Connecting, Live, Offline }

public static class Json
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
}
