namespace Overseer.Desktop.Core;

/// <param name="Visible">Checked in the desktop "Agentes visibles" menu.</param>
/// <param name="HiddenInWeb">Turned off in the web dock settings; the bar follows that choice too.</param>
public sealed record AgentChoice(AgentInfo Agent, bool Visible, bool HiddenInWeb)
{
    public bool Shown => Visible && !HiddenInWeb;
}

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
    /// Detected agents in the saved order (then any agent missing from it), each with whether the bar shows it.
    /// An agent is shown unless it is hidden in the web dock view or hidden locally from the desktop menu.
    /// Without server data every known agent counts as detected.
    /// </summary>
    public static IReadOnlyList<AgentChoice> Choices(IReadOnlyList<AgentInfo>? agents, ViewPreferences? preferences, IEnumerable<string>? localHidden = null)
    {
        var profiles = Defaults.Select(profile => agents?.FirstOrDefault(agent => agent.Id == profile.Id) is { } served
            ? profile with { Name = Blank(served.Name) ?? profile.Name, Color = Blank(served.Color) ?? profile.Color, Detected = served.Detected }
            : profile).ToList();
        var order = (preferences?.AgentOrder ?? []).Where(IsKnown).Distinct().ToList();
        order.AddRange(profiles.Select(profile => profile.Id).Where(id => !order.Contains(id)));
        var webHidden = preferences?.DockHiddenAgents ?? [];
        var local = new HashSet<string>(localHidden ?? []);
        return order.Select(id => profiles.First(profile => profile.Id == id))
            .Where(profile => profile.Detected != false)
            .Select(profile => new AgentChoice(profile, !local.Contains(profile.Id), webHidden.Contains(profile.Id)))
            .ToList();
    }

    /// <summary>Agents shown in the bar, in order.</summary>
    public static IReadOnlyList<AgentInfo> VisibleAgents(IReadOnlyList<AgentInfo>? agents, ViewPreferences? preferences, IEnumerable<string>? localHidden = null) =>
        Choices(agents, preferences, localHidden).Where(choice => choice.Shown).Select(choice => choice.Agent).ToList();

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
