using System.Collections.Generic;
using Overseer.Desktop.Core;

namespace Overseer.Desktop;

/// <summary>Commands shared by the tray menu and the bar's right-click menu, so both always show the same state.</summary>
public interface IBarCommands
{
    IReadOnlyList<AgentChoice> AgentChoices { get; }
    void SetAgentVisible(string agent, bool visible);
    bool Topmost { get; }
    void SetTopmost(bool value);
    bool Calm { get; }
    void SetCalm(bool value);
    bool BarVisible { get; }
    void ToggleBar();
    void OpenWeb();
    void Quit();
    /// <summary>Display text of the global shortcut, or null when it is off or could not be registered.</summary>
    string? HotkeyText { get; }
}
