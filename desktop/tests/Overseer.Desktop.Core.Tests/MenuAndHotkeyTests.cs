using Overseer.Desktop.Core;

namespace Overseer.Desktop.Core.Tests;

public class AgentChoiceTests
{
    [Fact]
    public void LocalMenuHidesAgentsOnTopOfTheWebDockSettings()
    {
        var agents = AgentCatalog.Defaults.Select(agent => agent with { Detected = agent.Id != "antigravity" }).ToList();
        var preferences = new ViewPreferences { AgentOrder = ["deepseek", "claude", "codex", "antigravity"], DockHiddenAgents = ["codex"] };
        var choices = AgentCatalog.Choices(agents, preferences, ["claude"]);
        Assert.Equal(["deepseek", "claude", "codex"], choices.Select(choice => choice.Agent.Id));
        Assert.Equal([true, false, true], choices.Select(choice => choice.Visible));
        Assert.Equal([false, false, true], choices.Select(choice => choice.HiddenInWeb));
        Assert.Equal(["deepseek"], AgentCatalog.VisibleAgents(agents, preferences, ["claude"]).Select(agent => agent.Id));
    }

    [Fact]
    public void HiddenAgentsAndHotkeyPersistInSettings()
    {
        var path = Path.Combine(Path.GetTempPath(), $"overseer-{Guid.NewGuid():N}", "desktop.json");
        Assert.Equal("Ctrl+Shift+O", DesktopSettings.Load(path, _ => null).Hotkey);
        new DesktopSettings { HiddenAgents = ["codex", "deepseek"], Hotkey = "" }.Save(path);
        var loaded = DesktopSettings.Load(path, _ => null);
        Assert.Equal(["codex", "deepseek"], loaded.HiddenAgents);
        Assert.Equal("", loaded.Hotkey);
        Assert.Contains("\"hiddenAgents\"", File.ReadAllText(path));
    }
}

public class HotkeyTests
{
    [Theory]
    [InlineData("Ctrl+Shift+O", true, true, false, false, "O", "Ctrl+Shift+O")]
    [InlineData("win + alt + o", false, false, true, true, "O", "Alt+Win+O")]
    [InlineData("Control+Alt+9", true, false, true, false, "D9", "Ctrl+Alt+9")]
    [InlineData("Ctrl+F12", true, false, false, false, "F12", "Ctrl+F12")]
    public void ParsesModifiersAndKey(string text, bool control, bool shift, bool alt, bool windows, string key, string display)
    {
        var hotkey = Hotkey.Parse(text)!;
        Assert.Equal(new Hotkey(control, shift, alt, windows, key), hotkey);
        Assert.Equal(display, hotkey.ToString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("O")]
    [InlineData("Ctrl+Shift")]
    [InlineData("Hyper+O")]
    [InlineData("Ctrl+Escapeee")]
    public void RejectsEmptyBareOrUnknownShortcuts(string? text) => Assert.Null(Hotkey.Parse(text));
}
