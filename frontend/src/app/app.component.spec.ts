import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AppComponent } from './app.component';
import { EventsService } from './events.service';
import { AgentEvent } from './models';

describe('Overseer interface state', () => {
  let events: Subject<AgentEvent>;
  let modes: Subject<'live' | 'reconnecting' | 'offline' | 'demo'>;

  beforeEach(() => {
    events = new Subject<AgentEvent>();
    modes = new Subject();
    vi.spyOn(window, 'fetch').mockImplementation(async () => new Response('[]'));
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: EventsService, useValue: {
        stream: () => events, modeStream: () => modes, destroy: () => undefined,
        fetchEvents: vi.fn().mockResolvedValue([]),
      } }],
    });
  });

  it('keeps the two fixed cabins and starts with an honest empty view', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.cabin').length).toBe(2);
    expect(fixture.nativeElement.querySelector('#empty-title')?.textContent).toContain('Conecta tus agentes');
    fixture.destroy();
  });

  it('gives untitled events a type and abbreviated cwd fallback', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    events.next({ uid: 'untitled', agent: 'claude', type: 'session_start', title: '', ts: '2026-10-02T10:00:00Z', meta: { cwd: 'C:/work/project-one' } });
    expect(fixture.componentInstance.events()[0].title).toBe('Inicio de sesión · project-one');
    fixture.destroy();
  });

  it('combines agent, session, type and text filters', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    events.next({ uid: 'a', agent: 'claude', session_id: 's1', type: 'tool_use', title: 'Read project', detail: 'src/app.ts', ts: '2026-10-02T10:00:00Z' });
    events.next({ uid: 'b', agent: 'codex', session_id: 's1', type: 'tool_use', title: 'Read project', detail: 'src/app.ts', ts: '2026-10-02T10:01:00Z' });
    events.next({ uid: 'c', agent: 'claude', session_id: 's2', type: 'message', title: 'Read project', detail: 'src/app.ts', ts: '2026-10-02T10:02:00Z' });
    const component = fixture.componentInstance;
    component.agentFilter.set('claude'); component.sessionFilter.set('s1'); component.typeFilter.set('tool_use'); component.textFilter.set('src/app');
    expect(component.filteredEvents().map((event) => event.uid)).toEqual(['a']);
    fixture.destroy();
  });

  it('keeps the live event window bounded at 3000 records', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    for (let index = 0; index < 3010; index++) events.next({ uid: `e${index}`, agent: index % 2 ? 'codex' : 'claude', type: 'message', title: `event ${index}`, ts: new Date(1_790_000_000_000 + index).toISOString() });
    expect(fixture.componentInstance.events().length).toBe(3000);
    expect(fixture.componentInstance.events()[0].uid).toBe('e10');
    fixture.destroy();
  });

  it('keeps cabin state, now card, and recent session aligned when events arrive out of order', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const latestAt = Date.now();
    events.next({ id: 10, uid: 'claude-latest', agent: 'claude', session_id: 'claude-current', type: 'tool_use', tool: 'Edit', title: 'Edita ResumenCarrito.ts', ts: new Date(latestAt).toISOString() });
    events.next({ id: 12, uid: 'codex-latest', agent: 'codex', session_id: 'codex-current', type: 'tool_use', tool: 'exec', title: 'Ejecuta las pruebas del carrito', detail: 'npm test -- carrito', ts: new Date(latestAt + 1).toISOString(), meta: { command: 'npm test -- carrito' } });
    events.next({ id: 9, uid: 'claude-late-old', agent: 'claude', session_id: 'claude-old', type: 'thinking', title: 'Pensando en una tarea anterior', ts: new Date(latestAt - 5_000).toISOString() });
    events.next({ id: 11, uid: 'codex-late-old', agent: 'codex', session_id: 'codex-current', type: 'thinking', title: 'Evento antiguo de Codex', ts: new Date(latestAt - 1_000).toISOString() });

    await new Promise((resolve) => setTimeout(resolve, 300));
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const cabins = fixture.nativeElement.querySelectorAll('.cabin');
    expect(component.stateFor('claude').title).toBe('Edita ResumenCarrito.ts');
    expect(component.mascotState.states().claude).toBe('editing');
    expect(cabins[0].querySelector('.now-card strong')?.textContent).toContain('Edita ResumenCarrito.ts');
    expect(cabins[0].querySelector('.status-pill')?.textContent).toContain('Editando');
    expect(cabins[0].querySelector('ao-chispa svg')?.getAttribute('data-state')).toBe('editing');
    expect(component.stateFor('codex').title).toBe('Ejecuta las pruebas del carrito');
    expect(component.mascotState.states().codex).toBe('running');
    expect(cabins[1].querySelector('.now-card strong')?.textContent).toContain('Ejecuta las pruebas del carrito');
    expect(cabins[1].querySelector('.status-pill')?.textContent).toContain('Ejecutando');
    expect(cabins[1].querySelector('ao-nodo svg')?.getAttribute('data-state')).toBe('running');
    expect(component.sessionsFor('claude')[0].id).toBe('claude-current');
    expect(component.sessionsFor('codex')[0].last_action).toBe('Ejecuta las pruebas del carrito');
    fixture.destroy();
  });

  it('bounds events received while the timeline is paused', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.pause();
    for (let index = 0; index < 270; index++) events.next({ uid: `paused-${index}`, agent: 'claude', type: 'message', title: `event ${index}`, ts: new Date(1_790_000_000_000 + index).toISOString() });
    expect(component.pauseBuffer().length).toBe(250);
    expect(component.events()).toHaveLength(0);
    component.pause();
    expect(component.events()).toHaveLength(250);
    fixture.destroy();
  });

  it('does not trigger keyboard shortcuts while an input owns focus', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.focus(); input.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(fixture.componentInstance.agentFilter()).toBe('all');
    document.body.focus(); window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    expect(fixture.componentInstance.agentFilter()).toBe('codex');
    fixture.destroy();
  });

  it('notifies only with granted permission while the tab is hidden', () => {
    const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    const originalNotification = Object.getOwnPropertyDescriptor(window, 'Notification');
    const sent: string[] = [];
    class Notice { static permission = 'granted'; constructor(title: string) { sent.push(title); } }
    Object.defineProperty(window, 'Notification', { configurable: true, value: Notice });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    fixture.componentInstance.notificationEnabled.set(true);
    events.next({ uid: 'permission', agent: 'claude', type: 'permission_request', title: 'Permiso requerido', ts: new Date().toISOString() });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('Overseer');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    events.next({ uid: 'turn-end-visible', agent: 'codex', type: 'turn_end', title: 'Turno terminado', ts: new Date().toISOString() });
    expect(sent).toHaveLength(1);
    Notice.permission = 'denied';
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    events.next({ uid: 'turn-end-denied', agent: 'codex', type: 'turn_end', title: 'Turno terminado', ts: new Date().toISOString() });
    expect(sent).toHaveLength(1);
    fixture.destroy();
    if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
    else Reflect.deleteProperty(document, 'visibilityState');
    if (originalNotification) Object.defineProperty(window, 'Notification', originalNotification);
    else Reflect.deleteProperty(window, 'Notification');
  });
});
