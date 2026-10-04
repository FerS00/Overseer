import { AgentEvent } from '../models';
import { MascotStateService } from './mascot-state.service';

describe('MascotStateService event recency', () => {
  it('keeps the newest per-session state when older Codex and Claude events arrive later', async () => {
    const service = new MascotStateService('server' as unknown as object);
    const latestAt = Date.now();
    const send = (event: AgentEvent) => service.consume(event);

    send({ id: 10, uid: 'claude-latest', agent: 'claude', session_id: 'claude-current', type: 'tool_use', tool: 'Edit', title: 'Edita ResumenCarrito.ts', ts: new Date(latestAt).toISOString() });
    send({ id: 12, uid: 'codex-latest', agent: 'codex', session_id: 'codex-current', type: 'tool_use', tool: 'exec', title: 'Ejecuta las pruebas del carrito', detail: 'npm test -- carrito', ts: new Date(latestAt + 1).toISOString(), meta: { command: 'npm test -- carrito' } });
    send({ id: 9, uid: 'claude-late-old', agent: 'claude', session_id: 'claude-old', type: 'thinking', title: 'Pensando en una tarea anterior', ts: new Date(latestAt - 5_000).toISOString() });
    send({ id: 11, uid: 'codex-late-old', agent: 'codex', session_id: 'codex-current', type: 'thinking', title: 'Evento antiguo de Codex', ts: new Date(latestAt - 1_000).toISOString() });
    send({ id: 13, uid: 'codex-late-turn-end', agent: 'codex', session_id: 'codex-current', type: 'turn_end', title: 'Turno antiguo finalizado', ts: new Date(latestAt - 2_000).toISOString() });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(service.states()).toEqual({ claude: 'editing', codex: 'running', antigravity: 'idle', deepseek: 'idle' });
    service.ngOnDestroy();
  });
});
