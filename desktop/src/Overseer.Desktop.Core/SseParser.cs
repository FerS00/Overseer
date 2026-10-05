namespace Overseer.Desktop.Core;

public sealed record SseMessage(string Event, string? Id, string Data);

/// <summary>Incremental parser for <c>text/event-stream</c> lines (WHATWG rules: comments, multi-line data, id, event).</summary>
public sealed class SseParser
{
    private readonly List<string> data = [];
    private string eventName = "message";
    private string? id;

    /// <summary>The last id received, to send back as <c>Last-Event-ID</c> when reconnecting.</summary>
    public string? LastEventId { get; private set; }

    /// <summary>Feeds one line without its terminator. Returns a message when a blank line completes one.</summary>
    public SseMessage? Feed(string line)
    {
        if (line.Length == 0)
        {
            if (data.Count == 0) { eventName = "message"; return null; }
            var message = new SseMessage(eventName, id, string.Join('\n', data));
            data.Clear(); eventName = "message";
            return message;
        }
        if (line[0] == ':') return null;
        var colon = line.IndexOf(':');
        var field = colon < 0 ? line : line[..colon];
        var value = colon < 0 ? "" : line[(colon + 1)..];
        if (value.StartsWith(' ')) value = value[1..];
        switch (field)
        {
            case "data": data.Add(value); break;
            case "event": eventName = value; break;
            case "id" when !value.Contains('\0'): id = value; LastEventId = value; break;
        }
        return null;
    }
}
