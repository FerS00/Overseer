using System;
using System.Drawing;
using System.Windows.Forms;

namespace Overseer.Desktop;

/// <summary>System tray icon (Michi) with the same commands as the bar's right-click menu.</summary>
public sealed class TrayIcon : IDisposable
{
    private readonly NotifyIcon icon;
    private readonly IBarCommands commands;
    private readonly ToolStripMenuItem agentsItem = new("Agentes visibles");
    private readonly ToolStripMenuItem barItem = new("Ocultar barra");
    private readonly ToolStripMenuItem topmostItem = new("Siempre visible") { CheckOnClick = true };
    private readonly ToolStripMenuItem calmItem = new("Modo calma") { CheckOnClick = true };

    public TrayIcon(IBarCommands commands)
    {
        this.commands = commands;
        barItem.Click += (_, _) => commands.ToggleBar();
        topmostItem.Click += (_, _) => commands.SetTopmost(topmostItem.Checked);
        calmItem.Click += (_, _) => commands.SetCalm(calmItem.Checked);
        // Keep the agents submenu open while toggling several agents.
        agentsItem.DropDown.Closing += (_, e) => { if (e.CloseReason == ToolStripDropDownCloseReason.ItemClicked) e.Cancel = true; };

        var menu = new ContextMenuStrip();
        menu.Items.Add(agentsItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(barItem);
        menu.Items.Add(topmostItem);
        menu.Items.Add(calmItem);
        menu.Items.Add(new ToolStripMenuItem("Abrir versión web", null, (_, _) => commands.OpenWeb()));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Salir", null, (_, _) => commands.Quit()));
        menu.Opening += (_, _) => Refresh();

        icon = new NotifyIcon { Icon = LoadIcon(), Text = "Overseer", ContextMenuStrip = menu, Visible = true };
        icon.MouseClick += (_, e) => { if (e.Button == MouseButtons.Left) commands.ToggleBar(); };
    }

    /// <summary>Syncs checks and the agent list with the current state before the menu is shown.</summary>
    private void Refresh()
    {
        barItem.Text = commands.BarVisible ? "Ocultar barra" : "Mostrar barra";
        barItem.ShortcutKeyDisplayString = commands.HotkeyText ?? "";
        topmostItem.Checked = commands.Topmost;
        calmItem.Checked = commands.Calm;
        agentsItem.DropDownItems.Clear();
        var choices = commands.AgentChoices;
        if (choices.Count == 0) agentsItem.DropDownItems.Add(new ToolStripMenuItem("Ningún agente detectado") { Enabled = false });
        foreach (var choice in choices)
        {
            var id = choice.Agent.Id;
            var item = new ToolStripMenuItem(choice.HiddenInWeb ? $"{choice.Agent.Name} · oculto en la web" : choice.Agent.Name)
            {
                Checked = choice.Shown, CheckOnClick = true, Enabled = !choice.HiddenInWeb,
                ToolTipText = choice.HiddenInWeb ? "Actívalo en Ajustes de vista de la web" : null,
            };
            item.CheckedChanged += (_, _) => commands.SetAgentVisible(id, item.Checked);
            agentsItem.DropDownItems.Add(item);
        }
    }

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
