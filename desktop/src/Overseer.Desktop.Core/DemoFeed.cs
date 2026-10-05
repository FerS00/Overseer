namespace Overseer.Desktop.Core;

/// <summary>Synthetic events for <c>--demo</c>: shows the bar working without a backend.</summary>
public static class DemoFeed
{
    private static readonly (string Agent, string Type, string? Tool, string Detail)[] Script =
    [
        ("claude", "thinking", null, "Plan del resumen del carrito"),
        ("codex", "tool_use", "exec", "rg --files src/carrito"),
        ("claude", "tool_use", "Read", "src/carrito/ResumenCarrito.ts"),
        ("antigravity", "tool_use", "run_command", "npm test -- carrito"),
        ("deepseek", "tool_use", "shell", "npx ng build --configuration production"),
        ("claude", "tool_use", "Edit", "src/carrito/ResumenCarrito.ts"),
        ("codex", "permission_request", null, "Quiere ejecutar npm ci fuera del sandbox"),
        ("antigravity", "error", null, "node --test: 1 prueba fallida"),
        ("deepseek", "tool_use", "write_file", "docs/DESIGN.md"),
        ("claude", "turn_end", null, "4 archivos cambiados"),
        ("codex", "tool_use", "apply_patch", "*** Update File: a.ts\n*** Add File: b.ts"),
        ("antigravity", "tool_use", "search_web", "https://learn.microsoft.com/dotnet/desktop/wpf/"),
        ("deepseek", "turn_end", null, "Turno cerrado"),
    ];

    public static AgentEvent At(int index, DateTimeOffset now)
    {
        var (agent, type, tool, detail) = Script[index % Script.Length];
        return new AgentEvent
        {
            Id = index + 1, Agent = agent, Type = type, Tool = tool, Detail = detail, SessionId = $"{agent}-demo-session",
            Title = tool is null ? type : $"Llamando a {tool}", Ts = now.ToString("O"),
        };
    }
}
