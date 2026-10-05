using System.Net;
using System.Text;
using System.Text.Json;
using Overseer.Desktop.Core;

namespace Overseer.Desktop.Core.Tests;

public class SseParserTests
{
    [Fact]
    public void ParsesNamedEventsWithIdsCommentsAndMultilineData()
    {
        var parser = new SseParser();
        var messages = new List<SseMessage>();
        foreach (var line in new[] { ": keep-alive", "", "id: 41", "event: event", "data: {\"a\":1,", "data: \"b\":2}", "", "data: plain", "" })
            if (parser.Feed(line) is { } message) messages.Add(message);
        Assert.Equal(2, messages.Count);
        Assert.Equal(new SseMessage("event", "41", "{\"a\":1,\n\"b\":2}"), messages[0]);
        Assert.Equal("message", messages[1].Event);
        Assert.Equal("41", parser.LastEventId);
    }
}

public class EventClassifierTests
{
    private static AgentEvent Tool(string agent, string tool, string detail, string? command = null) => new()
    {
        Agent = agent, Type = "tool_use", Tool = tool, Title = $"Llamando a {tool}", Detail = detail, Ts = "2026-10-05T10:00:00Z",
        Meta = command is null ? null : new() { ["command"] = JsonDocument.Parse(JsonSerializer.Serialize(command)).RootElement },
    };

    [Theory]
    [InlineData("claude", "Read", "/w/src/main.ts", null, MascotState.Reading, "read.file")]
    [InlineData("claude", "Glob", "src/**/*.ts", null, MascotState.Reading, "read.tree")]
    [InlineData("claude", "WebFetch", "https://angular.dev", null, MascotState.Reading, "read.web")]
    [InlineData("claude", "Edit", "/w/src/app.ts", null, MascotState.Editing, "edit.file")]
    [InlineData("claude", "Bash", "npm ci && npm test", null, MascotState.Running, "run.test")]
    [InlineData("claude", "Bash", "npx ng build", null, MascotState.Running, "run.build")]
    [InlineData("claude", "Bash", "npm ci", null, MascotState.Running, "run.install")]
    [InlineData("claude", "Task", "Revisa la accesibilidad", null, MascotState.Running, "run.wait")]
    [InlineData("claude", "mcp__github__get_issue", "{}", null, MascotState.Running, "run.net")]
    [InlineData("codex", "exec_command", "", "rg --files frontend", MascotState.Reading, "read.tree")]
    [InlineData("codex", "exec", "", "mvn -q test", MascotState.Running, "run.test")]
    [InlineData("antigravity", "view_file", "integrations/hook.mjs", null, MascotState.Reading, "read.file")]
    [InlineData("antigravity", "run_command", "node integrations/doctor.mjs", null, MascotState.Running, "run.shell")]
    [InlineData("deepseek", "write_file", "docs/DESIGN.md", null, MascotState.Editing, "edit.file")]
    public void MatchesTheWebClassifier(string agent, string tool, string detail, string? command, MascotState state, string activity)
    {
        var e = Tool(agent, tool, detail, command);
        Assert.Equal(state, EventClassifier.Classify(e));
        Assert.Equal(activity, EventClassifier.ClassifyActivity(e, state));
    }

    [Fact]
    public void ClassifiesLifecycleEventsAndDescribesTargets()
    {
        Assert.Equal(MascotState.Permission, EventClassifier.Classify(new AgentEvent { Agent = "claude", Type = "permission_request" }));
        Assert.Equal(MascotState.Done, EventClassifier.Classify(new AgentEvent { Agent = "claude", Type = "turn_end" }));
        Assert.Equal(MascotState.Error, EventClassifier.Classify(new AgentEvent { Agent = "claude", Type = "tool_result", Detail = "exit code 1" }));
        Assert.Equal(MascotState.Thinking, EventClassifier.Classify(new AgentEvent { Agent = "claude", Type = "user_prompt" }));
        Assert.Equal(new ActivityTarget("command", "npm test -- carrito"), EventClassifier.DescribeTarget(Tool("codex", "exec", "", "exec npm test -- carrito"), "run.test"));
        Assert.Equal(new ActivityTarget("url", "https://api.example.test/x"), EventClassifier.DescribeTarget(Tool("claude", "Bash", "curl https://api.example.test/x"), "run.net"));
        var shortened = EventClassifier.MiddleEllipsis("frontend/src/app/very/deep/folder/activity-badge.component.ts", 40);
        Assert.Equal(40, shortened.Length);
        Assert.EndsWith("activity-badge.component.ts", shortened);
    }
}

public class AgentTrackerTests
{
    private static AgentEvent At(int seconds, string type, string? tool = null, string? detail = null, long? id = null) => new()
    {
        Agent = "claude", Type = type, Tool = tool, Detail = detail, Id = id, SessionId = "s1",
        Ts = new DateTimeOffset(2026, 10, 5, 10, 0, 0, TimeSpan.Zero).AddSeconds(seconds).ToString("O"),
    };

    [Fact]
    public void KeepsTheNewestStateAndOnlyMovesSinceWhenStateOrSubStateChanges()
    {
        var tracker = new AgentTracker();
        Assert.True(tracker.Consume(At(0, "tool_use", "Bash", "npm test", 1)));
        Assert.True(tracker.Consume(At(5, "tool_use", "Bash", "npx vitest run", 2)));
        Assert.False(tracker.Consume(At(3, "thinking", id: 3)));
        Assert.False(tracker.Consume(new AgentEvent { Agent = "other", Type = "thinking", Ts = "2026-10-05T10:00:10Z" }));
        var snapshot = tracker.Get("claude");
        Assert.Equal((MascotState.Running, "run.test", "Ejecutando pruebas", "TESTS"), (snapshot.State, snapshot.Activity, snapshot.Label, snapshot.ShortLabel));
        Assert.Equal(new DateTimeOffset(2026, 10, 5, 10, 0, 0, TimeSpan.Zero), snapshot.StateSince);
        tracker.Consume(At(9, "tool_use", "Bash", "npm run build", 4));
        Assert.Equal(At(9, "x").Timestamp, tracker.Get("claude").StateSince);
    }

    [Fact]
    public void DoneTurnsIdleAfterThreeSecondsAndAgentsSleepAfterTenMinutes()
    {
        var tracker = new AgentTracker();
        var changes = new List<MascotState>();
        tracker.Changed += snapshot => changes.Add(snapshot.State);
        tracker.Consume(At(0, "turn_end", id: 1));
        var start = At(0, "x").Timestamp!.Value;
        tracker.Tick(start.AddSeconds(2));
        Assert.Equal(MascotState.Done, tracker.Get("claude").State);
        tracker.Tick(start.AddSeconds(3));
        Assert.Equal(MascotState.Idle, tracker.Get("claude").State);
        tracker.Tick(start.AddMinutes(10));
        Assert.Equal(MascotState.Sleeping, tracker.Get("claude").State);
        Assert.Equal([MascotState.Done, MascotState.Idle, MascotState.Sleeping], changes);
    }
}

public class AgentCatalogTests
{
    [Fact]
    public void ShowsDetectedDockAgentsInSavedOrder()
    {
        var agents = AgentCatalog.Defaults.Select(agent => agent with { Detected = agent.Id != "antigravity" }).ToList();
        var preferences = new ViewPreferences { AgentOrder = ["deepseek", "claude", "unknown", "deepseek"], DockHiddenAgents = ["codex"] };
        Assert.Equal(["deepseek", "claude"], AgentCatalog.VisibleAgents(agents, preferences).Select(agent => agent.Id));
        Assert.Equal(["claude", "codex", "antigravity", "deepseek"], AgentCatalog.VisibleAgents(null, null).Select(agent => agent.Id));
    }
}

public class DesktopSettingsTests
{
    [Fact]
    public void RoundTripsAndLetsTheEnvironmentOverrideTheUrl()
    {
        var path = Path.Combine(Path.GetTempPath(), $"overseer-{Guid.NewGuid():N}", "desktop.json");
        new DesktopSettings { Left = 10, Top = 20, Topmost = false }.Save(path);
        var loaded = DesktopSettings.Load(path, _ => null);
        Assert.Equal((10d, 20d, false, "http://127.0.0.1:8787"), (loaded.Left!.Value, loaded.Top!.Value, loaded.Topmost, loaded.BaseUrl));
        Assert.Equal("http://localhost:9000", DesktopSettings.Load(path, name => name == "OVERSEER_URL" ? "http://localhost:9000" : null).BaseUrl);
        File.WriteAllText(path, "{ not json");
        Assert.Equal("/events", DesktopSettings.Load(path, _ => null).EventsPath);
    }
}

public class LiveConnectionTests
{
    private sealed class FakeBackend : HttpMessageHandler
    {
        public string? LastEventIdSeen;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = request.RequestUri!.AbsolutePath;
            string body = path switch
            {
                "/api/agents" => JsonSerializer.Serialize(AgentCatalog.Defaults),
                "/api/preferences" => "{\"agentOrder\":[\"codex\",\"claude\",\"antigravity\",\"deepseek\"],\"dockHiddenAgents\":[]}",
                "/api/events" => "[{\"id\":1,\"agent\":\"claude\",\"type\":\"thinking\",\"ts\":\"2026-10-05T10:00:00Z\"}]",
                "/events" => "id: 2\nevent: event\ndata: {\"id\":2,\"agent\":\"codex\",\"type\":\"tool_use\",\"tool\":\"exec\",\"meta\":{\"command\":\"npm test\"},\"ts\":\"2026-10-05T10:00:05Z\"}\n\n",
                _ => "{}",
            };
            if (path == "/events") LastEventIdSeen = request.Headers.TryGetValues("Last-Event-ID", out var values) ? values.First() : null;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, path == "/events" ? "text/event-stream" : "application/json") });
        }
    }

    [Fact]
    public async Task SeedsHistoryThenFollowsTheStreamAndResumesFromTheLastId()
    {
        var backend = new FakeBackend();
        var tracker = new AgentTracker();
        await using var connection = new LiveConnection(new OverseerClient(new HttpClient(backend), new Uri("http://127.0.0.1:8787/")), tracker);
        IReadOnlyList<AgentInfo>? catalog = null;
        connection.CatalogLoaded += (agents, _) => catalog = agents;
        connection.Start();
        for (var i = 0; i < 100 && (tracker.Get("codex").State != MascotState.Running || backend.LastEventIdSeen is null); i++) await Task.Delay(20);
        Assert.Equal(4, catalog!.Count);
        Assert.Equal(MascotState.Thinking, tracker.Get("claude").State);
        Assert.Equal((MascotState.Running, "run.test"), (tracker.Get("codex").State, tracker.Get("codex").Activity));
        Assert.Equal("2", backend.LastEventIdSeen);
    }
}
