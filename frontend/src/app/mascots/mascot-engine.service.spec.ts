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
    vi.useRealTimers();
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
    else Reflect.deleteProperty(window, 'matchMedia');
  });

  it('uses one pointer listener and one shared frame schedule', () => {
    vi.useFakeTimers();
    const schedule = vi.spyOn(window, 'setTimeout');
    const listener = vi.spyOn(window, 'addEventListener');
    const engine = new MascotEngine(document, 'browser' as unknown as object);
    const participants: MascotParticipant[] = Array.from({ length: 3 }, () => ({ lookAt: vi.fn(), renderFrame: vi.fn() }));
    participants.forEach((participant) => engine.register(participant));
    expect(listener.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenLastCalledWith(expect.any(Function), MascotEngine.FRAME_INTERVAL_MS);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MascotEngine.FRAME_INTERVAL_MS);
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

  it('slows idle gaze sampling and immediately resumes a shared fast schedule on pointer input', () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    let callback: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => { callback = frame; return 1; });
    const schedule = vi.spyOn(window, 'setTimeout');
    const engine = new MascotEngine(document, 'browser' as unknown as object);
    engine.register({ lookAt: vi.fn(), renderFrame: vi.fn() });
    vi.advanceTimersByTime(MascotEngine.FRAME_INTERVAL_MS);
    now = 6000;
    callback?.(now);
    expect(schedule).toHaveBeenLastCalledWith(expect.any(Function), MascotEngine.IDLE_FRAME_INTERVAL_MS);
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 100 }));
    expect(schedule).toHaveBeenLastCalledWith(expect.any(Function), MascotEngine.FRAME_INTERVAL_MS);
    engine.destroy();
  });

  it('stops and resumes the shared frame with document visibility', () => {
    vi.useFakeTimers();
    const cancelTimer = vi.spyOn(window, 'clearTimeout');
    const animationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const engine = new MascotEngine(document, 'browser' as unknown as object);
    engine.register({ lookAt: vi.fn(), renderFrame: vi.fn() });
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cancelTimer).toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(MascotEngine.FRAME_INTERVAL_MS);
    expect(animationFrame).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cancelFrame).toHaveBeenCalledWith(1);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(MascotEngine.FRAME_INTERVAL_MS);
    expect(animationFrame).toHaveBeenCalledTimes(2);
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
