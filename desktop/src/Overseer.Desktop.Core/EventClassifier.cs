using System.Text.RegularExpressions;

namespace Overseer.Desktop.Core;

public sealed record ActivityTarget(string Kind, string Text);

/// <summary>
/// Port of <c>classify</c> (mascot-state.ts) and <c>classifyActivity</c>/<c>describeTarget</c> (activity.ts).
/// Keep both in sync: the web dock and the desktop bar must show the same state for the same event.
/// </summary>
public static partial class EventClassifier
{
    private const RegexOptions I = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant;
    private static readonly Regex ReadTools = new(@"^(read|grep|glob|ls|rg|cat|type|get-content|websearch|web_search|search|find|sed|webfetch|web_fetch|view_file|view_code_item|read_file|read_url_content|list_dir|list_files|grep_search|codebase_search|find_by_name|search_web)$", I);
    private static readonly Regex EditTools = new(@"^(edit|write|multiedit|notebookedit|apply_patch|replace_file_content|multi_replace_file_content|write_to_file|write_file|edit_file)$", I);
    private static readonly Regex ShellTools = new(@"^(bash|shell|sh|powershell|pwsh|cmd|exec|exec_command|run_command|run_terminal_cmd|terminal|local_shell)$", I);
    private static readonly Regex WebTools = new(@"^(websearch|webfetch|web_search|web_fetch|search_web|read_url_content|fetch|browser)$", I);
    private static readonly Regex TreeTools = new(@"^(glob|ls|list_dir|list_directory|tree|find_by_name|list_files)$", I);
    private static readonly Regex BatchTools = new(@"^(grep|search|grep_search|codebase_search|search_files|find)$", I);
    private static readonly Regex WaitTools = new(@"^(task|agent|spawn_agent|subagent|dispatch_agent|wait|sleep)$", I);
    private static readonly Regex Test = new(@"\b(vitest|jest|pytest|mocha|karma|phpunit|rspec|(?:npx\s+)?playwright\s+test|go\s+test|cargo\s+test|node\s+--test|deno\s+test|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|e2e)\b|mvnw?\b[^\n]*\b(?:test|verify)\b|gradlew?\b[^\n]*\btest\b|ng\s+test|dotnet\s+test)", I);
    private static readonly Regex Build = new(@"\b(ng\s+build|tsc\b|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build\b|mvnw?\b[^\n]*\b(?:package|install|compile)\b|gradlew?\b[^\n]*\b(?:build|assemble)\b|cargo\s+build|docker\s+(?:compose\s+)?build|go\s+build|make\b|dotnet\s+build|vite\s+build|webpack\b)", I);
    private static readonly Regex Install = new(@"\b((?:npm|pnpm|yarn|bun)\s+(?:ci|install|i|add)\b|pip3?\s+install|uv\s+(?:sync|pip\s+install)|poetry\s+install|mvnw?\b[^\n]*\bdependency:|go\s+mod\s+(?:download|tidy)|cargo\s+fetch|bundle\s+install|composer\s+install)", I);
    private static readonly Regex Net = new(@"\b(curl|wget|invoke-webrequest|invoke-restmethod|iwr|irm|gh\s+api|http(?:ie)?\s)", I);
    private static readonly Regex Url = new(@"https?://[^\s""'<>]+", I);
    private static readonly Regex Failure = new(@"(?:^|\s)(?:exit code|exit status)\s*[1-9]|\bfail(?:ed|ure)?\b", I);
    private static readonly Regex PermissionText = new(@"permission|approval|approv", I);
    private static readonly Regex PatchFile = new(@"\*\*\* (?:Update|Add|Delete) File: (.+)");

    public static MascotState Classify(AgentEvent e)
    {
        var type = e.Type.ToLowerInvariant();
        var text = $"{e.Title} {e.Detail}";
        if (type is "error" or "posttoolusefailure" or "stopfailure" || Failure.IsMatch(text)) return MascotState.Error;
        if (type == "permission_request" || type == "notification" && PermissionText.IsMatch(text)) return MascotState.Permission;
        if (type == "session_end") return MascotState.Sleeping;
        if (type == "turn_end") return MascotState.Done;
        if (type == "handoff") return MascotState.Idle;
        if (type == "tool_use")
        {
            var tool = ToolOf(e);
            if (EditTools.IsMatch(tool) || CodexCommand(e, EditTools)) return MascotState.Editing;
            if (ReadTools.IsMatch(tool) || CodexCommand(e, ReadTools)) return MascotState.Reading;
            return MascotState.Running;
        }
        if (type is "session_start" or "user_prompt" or "thinking" or "message" or "tool_result") return MascotState.Thinking;
        return e.Status == "error" ? MascotState.Error : MascotState.Idle;
    }

    public static string? ClassifyActivity(AgentEvent e, MascotState state)
    {
        var tool = ToolOf(e);
        var tail = Regex.Split(tool, @"[\s·/]+").LastOrDefault(part => part.Length > 0) ?? tool;
        var segment = LastSegment(CommandOf(e));
        var word = FirstWord(segment);
        var subject = segment.Length > 0 ? segment : $"{tool} {e.Title} {e.Detail}";
        bool Any(Regex regex) => regex.IsMatch(tool) || regex.IsMatch(tail);
        switch (state)
        {
            case MascotState.Reading:
                if (Any(WebTools)) return "read.web";
                if (Any(TreeTools) || word is "ls" or "dir" or "tree" or "get-childitem" || Regex.IsMatch(segment, @"^rg\b.*--files\b")) return "read.tree";
                if (Any(BatchTools) || word is "rg" or "grep" or "find" or "select-string" or "ag" or "fd" || PatchFiles(e).Count > 1) return "read.batch";
                return "read.file";
            case MascotState.Editing:
                return string.Equals(tool, "multiedit", StringComparison.OrdinalIgnoreCase) || PatchFiles(e).Count > 1 ? "edit.multi" : "edit.file";
            case MascotState.Running:
                if (Test.IsMatch(subject)) return "run.test";
                if (Install.IsMatch(subject)) return "run.install";
                if (Build.IsMatch(subject)) return "run.build";
                if (tool.StartsWith("mcp__", StringComparison.OrdinalIgnoreCase) || Regex.IsMatch(tool, @"\bmcp\b", I) || Net.IsMatch(subject)) return "run.net";
                if (Any(WaitTools) || word is "wait" or "sleep" or "start-sleep") return "run.wait";
                return "run.shell";
            default:
                return null;
        }
    }

    public static ActivityTarget? DescribeTarget(AgentEvent e, string? activity)
    {
        if (activity is null) return null;
        var detail = FirstLine(e.Detail);
        var fallback = detail.Length > 0 ? detail : (e.Title ?? "").Trim();
        var path = (e.MetaText("file_path") ?? e.MetaText("path") ?? e.MetaText("file") ?? "").Trim();
        var command = CommandOf(e);
        ActivityTarget? Make(string kind, string text) => string.IsNullOrWhiteSpace(text) ? null : new(kind, text);
        switch (activity)
        {
            case "read.file" or "edit.file":
                return Make("file", path.Length > 0 ? path : fallback);
            case "edit.multi" or "read.batch":
                var files = PatchFiles(e);
                return files.Count > 1 ? new("files", string.Join(" · ", files)) : Make("files", e.MetaText("pattern") ?? (command.Length > 0 ? command : fallback));
            case "read.tree":
                return Make("tree", path.Length > 0 ? path : command.Length > 0 ? command : fallback);
            case "read.web":
                var url = e.MetaText("url") ?? e.MetaText("query") ?? Url.Match($"{e.Title} {e.Detail}").Value;
                return Make("url", string.IsNullOrEmpty(url) ? fallback : url);
            case "run.net":
                var endpoint = Url.Match($"{command} {e.Detail}");
                return endpoint.Success ? new("url", endpoint.Value) : Make("command", command.Length > 0 ? command : fallback);
            case "run.wait":
                return Make("agents", e.MetaText("description") ?? fallback);
            default:
                return Make("command", command.Length > 0 ? command : fallback);
        }
    }

    public static string ToolOf(AgentEvent e) => (e.Tool ?? e.MetaText("tool") ?? "").Trim();

    /// <summary>The shell command an event ran. Hooks put it in <c>detail</c>; Codex prefixes it with exec/exec_command.</summary>
    public static string CommandOf(AgentEvent e)
    {
        var text = e.MetaText("command") ?? e.MetaText("cmd") ?? "";
        if (text.Length == 0 && ShellTools.IsMatch(ToolOf(e))) text = FirstLine(e.Detail) is { Length: > 0 } line ? line : e.Title ?? "";
        return Regex.Replace(text, @"^\s*(?:exec_command|exec)\s+", "", I).Trim();
    }

    /// <summary>Shortens long paths in the middle so the file name stays visible.</summary>
    public static string MiddleEllipsis(string text, int max)
    {
        if (text.Length <= max) return text;
        var name = text.Split('/', '\\').LastOrDefault() ?? "";
        var tail = Math.Min(max - 2, Math.Max((int)Math.Ceiling(max * .62), name.Length));
        return text[..(max - tail - 1)] + "…" + text[^tail..];
    }

    private static bool CodexCommand(AgentEvent e, Regex tools)
    {
        var command = $"{e.Tool} {e.MetaText("command") ?? e.MetaText("cmd")} {e.Title} {e.Detail}".Trim();
        var exec = Regex.Match(command, @"(?:^|\s)(?:exec|exec_command)\s+(.+)", I);
        if (!exec.Success) return false;
        var rest = exec.Groups[1].Value.Trim();
        var first = Regex.Replace(rest.TrimStart('"', '\'').Split(' ', '"', '\'')[0].Split('/', '\\').Last(), @"\.exe$", "", I);
        if (string.Equals(first, "git", StringComparison.OrdinalIgnoreCase) && tools == ReadTools) return Regex.IsMatch(rest, @"^git\s+(?:diff|status|log)\b", I);
        return tools.IsMatch(first);
    }

    private static string LastSegment(string command)
    {
        var parts = Regex.Split(command, @"&&|\|\||;|\|").Select(part => part.Trim()).Where(part => part.Length > 0).ToArray();
        return parts.Length > 0 ? parts[^1] : command;
    }

    private static string FirstWord(string command)
    {
        var first = command.Trim().TrimStart('"', '\'').Split(' ', '"', '\'')[0].Split('/', '\\').Last();
        return Regex.Replace(first, @"\.exe$", "", I).ToLowerInvariant();
    }

    private static List<string> PatchFiles(AgentEvent e)
    {
        var text = $"{e.Detail}\n{e.MetaText("patch") ?? e.MetaText("input")}";
        var files = PatchFile.Matches(text).Select(match => match.Groups[1].Value.Trim()).ToList();
        if (e.MetaText("files") is { Length: > 0 } listed && e.Meta!["files"].ValueKind == System.Text.Json.JsonValueKind.Array)
            files.AddRange(e.Meta["files"].EnumerateArray().Select(item => item.ToString()));
        return files.Distinct().ToList();
    }

    private static string FirstLine(string? text) => (text ?? "").Split('\n')[0].Trim();
}
