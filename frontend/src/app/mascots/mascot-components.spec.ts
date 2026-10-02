import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChispaComponent, NodoComponent } from './mascot-components';
import { MascotEngine } from './mascot-engine.service';

describe('mascot drawings', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ChispaComponent, NodoComponent] });
    TestBed.inject(MascotEngine).setCalm(true);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem(MascotEngine.CALM_KEY);
  });

  it('renders Chispa as integral pixel cells and keeps its accessible state in sync', () => {
    const fixture = TestBed.createComponent(ChispaComponent);
    fixture.componentRef.setInput('state', 'error');
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges');
    expect(svg.getAttribute('data-state')).toBe('error');
    expect(svg.getAttribute('aria-label')).toBe('Chispa: error');
    for (const rect of svg.querySelectorAll('rect')) {
      for (const key of ['x', 'y', 'width', 'height']) {
        const value = rect.getAttribute(key);
        if (value !== null) expect(Number.isInteger(Number(value))).toBe(true);
      }
    }
    fixture.destroy();
  });

  it('uses unique gradient ids for multiple Nodo instances', () => {
    const first: ComponentFixture<NodoComponent> = TestBed.createComponent(NodoComponent);
    const second: ComponentFixture<NodoComponent> = TestBed.createComponent(NodoComponent);
    first.detectChanges(); second.detectChanges();

    const svgs = [first.nativeElement.querySelector('svg'), second.nativeElement.querySelector('svg')] as SVGSVGElement[];
    expect(svgs.map((svg) => svg.getAttribute('viewBox'))).toEqual(['0 0 120 120', '0 0 120 120']);
    const ids = svgs.map((svg) => svg.querySelector('linearGradient')?.id);
    expect(new Set(ids).size).toBe(2);
    expect(svgs[0].getAttribute('data-state')).toBe('idle');
    expect(svgs[0].getAttribute('aria-label')).toBe('Nodo: en espera');
    expect(svgs[0].querySelector('g[fill^="url(#"]')?.getAttribute('fill')).toBe(`url(#${ids[0]})`);
    first.destroy(); second.destroy();
  });

  it('does not react to clicks in calm mode', () => {
    const fixture = TestBed.createComponent(NodoComponent);
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
    const animate = vi.fn();
    Object.defineProperty(svg, 'animate', { configurable: true, value: animate });
    fixture.componentInstance.react();
    expect(animate).not.toHaveBeenCalled();
    expect(svg.classList.contains('calm')).toBe(true);
    fixture.destroy();
  });
});
