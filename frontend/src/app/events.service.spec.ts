import { EventsService } from './events.service';
import { AgentEvent } from './models';

class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onopen: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    listener?: EventListener;
    closed = false;
    constructor(public url: string) { FakeEventSource.instances.push(this); }
    addEventListener(_type: string, listener: EventListener): void { this.listener = listener; }
    close(): void { this.closed = true; }
    send(event: AgentEvent): void { this.listener?.({ data: JSON.stringify(event) } as MessageEvent as unknown as Event); }
}

describe('EventsService', () => {
    const originalSource = window.EventSource;
    let originalUrl: string;
    beforeEach(() => {
        FakeEventSource.instances = [];
        originalUrl = window.location.href;
        Object.defineProperty(window, 'EventSource', { configurable: true, value: FakeEventSource });
        vi.spyOn(window, 'fetch').mockResolvedValue(new Response('[]'));
    });
    afterEach(() => {
        history.replaceState({}, '', originalUrl);
        Object.defineProperty(window, 'EventSource', { configurable: true, value: originalSource });
        vi.useRealTimers();
    });

    it('listens to named event events and deduplicates by uid', () => {
        const service = new EventsService();
        const received: AgentEvent[] = [];
        service.stream().subscribe((e) => received.push(e));
        const event: AgentEvent = { id: 7, uid: 'u1', ts: '', agent: 'codex', type: 'tool_use', title: 'exec' };
        FakeEventSource.instances[0].send(event);
        FakeEventSource.instances[0].send(event);
        expect(received.length).toBe(1);
        expect(received[0].agent).toBe('codex');
        service.destroy();
    });

    it('reports reconnecting and retries with exponential backoff', () => {
        vi.useFakeTimers();
        const service = new EventsService();
        const modes: string[] = [];
        service.modeStream().subscribe((m) => modes.push(m));
        const first = FakeEventSource.instances[0];
        first.send({ id: 7, uid: 'resume-7', ts: '', agent: 'codex', type: 'message', title: 'cursor' });
        first.onerror?.(new Event('error'));
        expect(modes[modes.length - 1]).toBe('reconnecting');
        vi.advanceTimersByTime(999);
        expect(FakeEventSource.instances.length).toBe(1);
        vi.advanceTimersByTime(1);
        expect(FakeEventSource.instances.length).toBe(2);
        FakeEventSource.instances[1].onerror?.(new Event('error'));
        vi.advanceTimersByTime(1999);
        expect(FakeEventSource.instances.length).toBe(2);
        vi.advanceTimersByTime(1);
        expect(FakeEventSource.instances.length).toBe(3);
        expect(FakeEventSource.instances[2].url).toBe('/events?lastEventId=7');
        service.destroy();
    });

    it('starts demo only when demo=1 is in the query string', () => {
        vi.useFakeTimers();
        history.replaceState({}, '', '?demo=1');
        const service = new EventsService();
        let mode = '';
        service.modeStream().subscribe((m) => mode = m);
        expect(mode).toBe('demo');
        expect(FakeEventSource.instances.length).toBe(0);
        vi.advanceTimersByTime(1200);
        service.destroy();
    });

    it('requests the before cursor when loading an older page', async () => {
        const service = new EventsService();
        await service.fetchEvents({ limit: 200, before: '2026-10-02T10:00:00Z' });
        const urls = vi.mocked(window.fetch).mock.calls.map((call) => String(call[0]));
        expect(urls.some((url) => url.includes('limit=200') && url.includes('before=2026-10-02T10%3A00%3A00Z'))).toBe(true);
        service.destroy();
    });
});
