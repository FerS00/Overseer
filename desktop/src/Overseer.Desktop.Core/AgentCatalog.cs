namespace Overseer.Desktop.Core;

/// <summary>The four supported agents with their mascots, matching <c>frontend/src/app/agent-profiles.ts</c>.</summary>
public static class AgentCatalog
{
    public static readonly IReadOnlyList<AgentInfo> Defaults =
    [
        new() { Id = "claude", Name = "Claude Code", Mascot = "chispa", Color = "#E5774A", Detected = true },
        new() { Id = "codex", Name = "Codex", Mascot = "nodo", Color = "#8FA2FF", Detected = true },
        new() { Id = "antigravity", Name = "Antigravity", Mascot = "astro", Color = "#F28BC8", Detected = true },
        new() { Id = "deepseek", Name = "DeepSeek Harness", Mascot = "hondo", Color = "#5CC8F5", Detected = true },
    ];

    public static readonly IReadOnlyDictionary<string, string> MascotNames = new Dictionary<string, string>
    {
        ["chispa"] = "Chispa", ["nodo"] = "Nodo", ["astro"] = "Astro", ["hondo"] = "Hondo",
    };

    public static bool IsKnown(string agent) => Defaults.Any(profile => profile.Id == agent);

    /// <summary>
    /// Agents shown in the bar: the saved order, then any agent missing from it; only agents the backend detected
    /// and that are not hidden in the dock. Without server data every known agent is shown.
    /// </summary>
    public static IReadOnlyList<AgentInfo> VisibleAgents(IReadOnlyList<AgentInfo>? agents, ViewPreferences? preferences)
    {
        var profiles = Defaults.Select(profile => agents?.FirstOrDefault(agent => agent.Id == profile.Id) is { } served
            ? profile with { Name = Blank(served.Name) ?? profile.Name, Color = Blank(served.Color) ?? profile.Color, Detected = served.Detected }
            : profile).ToList();
        var order = (preferences?.AgentOrder ?? []).Where(IsKnown).Distinct().ToList();
        order.AddRange(profiles.Select(profile => profile.Id).Where(id => !order.Contains(id)));
        var hidden = preferences?.DockHiddenAgents ?? [];
        return order.Select(id => profiles.First(profile => profile.Id == id))
            .Where(profile => profile.Detected != false && !hidden.Contains(profile.Id))
            .ToList();
    }

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
