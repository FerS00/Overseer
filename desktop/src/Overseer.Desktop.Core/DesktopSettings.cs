using System.Text.Json;

namespace Overseer.Desktop.Core;

/// <summary>Per-user settings stored in <c>%APPDATA%\Overseer\desktop.json</c>.</summary>
public sealed record DesktopSettings
{
    public string BaseUrl { get; init; } = "http://127.0.0.1:8787";
    /// <summary>SSE endpoint of the backend. The current backend serves it at <c>/events</c>.</summary>
    public string EventsPath { get; init; } = "/events";
    public double? Left { get; init; }
    public double? Top { get; init; }
    public bool Topmost { get; init; } = true;
    public bool Calm { get; init; }

    public static string DefaultPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Overseer", "desktop.json");

    /// <summary>Loads the file, falling back to defaults; <c>OVERSEER_URL</c> overrides the backend address.</summary>
    public static DesktopSettings Load(string? path = null, Func<string, string?>? environment = null)
    {
        path ??= DefaultPath;
        environment ??= Environment.GetEnvironmentVariable;
        DesktopSettings settings;
        try { settings = File.Exists(path) ? JsonSerializer.Deserialize<DesktopSettings>(File.ReadAllText(path), Json.Options) ?? new() : new(); }
        catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException) { settings = new(); }
        if (environment("OVERSEER_URL") is { Length: > 0 } url) settings = settings with { BaseUrl = url };
        return settings;
    }

    public void Save(string? path = null)
    {
        path ??= DefaultPath;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, JsonSerializer.Serialize(this, new JsonSerializerOptions(Json.Options) { WriteIndented = true }));
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException) { /* settings are a convenience */ }
    }

    public Uri BaseUri => new(BaseUrl.EndsWith('/') ? BaseUrl : BaseUrl + "/");
}
