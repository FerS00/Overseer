import '@angular/compiler';
import { MascotEngine, MascotParticipant } from './mascot-engine.service';

describe('MascotEngine', () => {
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    localStorage.removeItem(MascotEngine.CALM_KEY);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  });
  afterEach(() => {
    vi.restoreAllMocks(); localStorage.removeItem(MascotEngine.CALM_KEY);
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
    else Reflect.deleteProperty(window, 'matchMedia');
  });

  it('uses one pointer listener and one animation frame for three registered mascots', () => {
    const listener = vi.spyOn(window, 'addEventListener');
    const engine = new MascotEngine(document, 'browser' as unknown as object);
    const participants: MascotParticipant[] = Array.from({ length: 3 }, () => ({ lookAt: vi.fn(), renderFrame: vi.fn() }));
    participants.forEach((participant) => engine.register(participant));
    expect(listener.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(1);
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    engine.destroy();
  });

  it('registers safely outside the browser', () => {
    const listener = vi.spyOn(window, 'addEventListener');
    const engine = new MascotEngine(document, 'server' as unknown as object);
    const participant = { lookAt: vi.fn(), renderFrame: vi.fn() };
    engine.register(participant);
    engine.setCalm(true);
    expect(listener.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(0);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    engine.destroy();
  });

  it('stops and resumes the shared frame with document visibility', () => {
    const engine = new MascotEngine(document, 'browser' as unknown as object);
    engine.register({ lookAt: vi.fn(), renderFrame: vi.fn() });
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
    engine.destroy();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('persists calm preference and combines it with reduced motion', () => {
    let motionListener: ((event: MediaQueryListEvent) => void) | undefined;
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false, addEventListener: (_name: string, callback: EventListenerOrEventListenerObject) => motionListener = callback as (event: MediaQueryListEvent) => void, removeEventListener: vi.fn() } as unknown as MediaQueryList);
    const engine = new MascotEngine(document, 'browser' as unknown as object);
    engine.setCalm(true);
    expect(engine.calm()).toBe(true);
    expect(localStorage.getItem(MascotEngine.CALM_KEY)).toBe('true');
    engine.destroy();
    const restored = new MascotEngine(document, 'browser' as unknown as object);
    expect(restored.calm()).toBe(true);
    restored.setCalm(false);
    motionListener?.({ matches: true } as MediaQueryListEvent);
    expect(restored.calm()).toBe(true);
    restored.destroy();
  });
});
