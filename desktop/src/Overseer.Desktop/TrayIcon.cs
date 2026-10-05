using System;
using System.Drawing;
using System.Windows.Forms;

namespace Overseer.Desktop;

/// <summary>System tray icon (Michi) with the bar's commands.</summary>
public sealed class TrayIcon : IDisposable
{
    private readonly NotifyIcon icon;
    private readonly ToolStripMenuItem barItem = new("Ocultar barra");
    private readonly ToolStripMenuItem topmostItem = new("Siempre visible") { CheckOnClick = true };
    private readonly ToolStripMenuItem calmItem = new("Modo calma") { CheckOnClick = true };

    public Action? ToggleBar { get; init; }
    public Action<bool>? SetTopmost { get; init; }
    public Action<bool>? SetCalm { get; init; }
    public Action? OpenWeb { get; init; }
    public Action? Exit { get; init; }

    public TrayIcon(bool topmost, bool calm)
    {
        topmostItem.Checked = topmost;
        calmItem.Checked = calm;
        barItem.Click += (_, _) => ToggleBar?.Invoke();
        topmostItem.Click += (_, _) => SetTopmost?.Invoke(topmostItem.Checked);
        calmItem.Click += (_, _) => SetCalm?.Invoke(calmItem.Checked);
        var menu = new ContextMenuStrip();
        menu.Items.Add(barItem);
        menu.Items.Add(topmostItem);
        menu.Items.Add(calmItem);
        menu.Items.Add(new ToolStripMenuItem("Abrir versión web", null, (_, _) => OpenWeb?.Invoke()));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Salir", null, (_, _) => Exit?.Invoke()));
        icon = new NotifyIcon { Icon = LoadIcon(), Text = "Overseer", ContextMenuStrip = menu, Visible = true };
        icon.MouseClick += (_, e) => { if (e.Button == MouseButtons.Left) ToggleBar?.Invoke(); };
    }

    public void SetBarVisible(bool visible) => barItem.Text = visible ? "Ocultar barra" : "Mostrar barra";

    /// <summary>Tray tooltips are limited to 63 characters.</summary>
    public void SetStatus(string status)
    {
        var text = $"Overseer · {status}";
        icon.Text = text.Length > 63 ? text[..63] : text;
    }

    private static Icon LoadIcon()
    {
        var resource = System.Windows.Application.GetResourceStream(new Uri("pack://application:,,,/Assets/michi.ico"));
        using var stream = resource!.Stream;
        return new Icon(stream, SystemInformation.SmallIconSize);
    }

    public void Dispose()
    {
        icon.Visible = false;
        icon.Dispose();
    }
}
