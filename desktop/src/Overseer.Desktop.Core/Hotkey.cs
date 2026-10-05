namespace Overseer.Desktop.Core;

/// <summary>A global keyboard shortcut such as "Ctrl+Shift+O" or "Win+Alt+O".</summary>
public sealed record Hotkey(bool Control, bool Shift, bool Alt, bool Windows, string Key)
{
    /// <summary>
    /// Parses "Modifier+…+Key". Requires at least one modifier so a bare key is never captured system-wide.
    /// Returns null for an empty or invalid value, which disables the shortcut.
    /// </summary>
    public static Hotkey? Parse(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var parts = text.Split('+', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2) return null;
        bool control = false, shift = false, alt = false, windows = false;
        foreach (var part in parts[..^1])
        {
            switch (part.ToLowerInvariant())
            {
                case "ctrl" or "control": control = true; break;
                case "shift" or "mayús" or "mayus": shift = true; break;
                case "alt": alt = true; break;
                case "win" or "windows" or "super": windows = true; break;
                default: return null;
            }
        }
        var key = parts[^1];
        if (key.Length == 1 && char.IsLetterOrDigit(key[0])) key = char.IsDigit(key[0]) ? $"D{key}" : key.ToUpperInvariant();
        else if (!System.Text.RegularExpressions.Regex.IsMatch(key, @"^(F([1-9]|1[0-9]|2[0-4])|Space|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right)$", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return null;
        return new Hotkey(control, shift, alt, windows, key);
    }

    public override string ToString() =>
        string.Join('+', new[] { Control ? "Ctrl" : null, Shift ? "Shift" : null, Alt ? "Alt" : null, Windows ? "Win" : null,
            Key.Length == 2 && Key[0] == 'D' && char.IsDigit(Key[1]) ? Key[1..] : Key }.Where(part => part is not null));
}
