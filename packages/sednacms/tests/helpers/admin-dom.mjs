import { JSDOM } from 'jsdom';

// JSDOM supplies DOM behavior; browser checks cover layout and actual focus trapping.
export function createAdminDom() {
  const dom = new JSDOM('<div id="app"></div>', {
    url: 'https://cms.example.com',
    pretendToBeVisual: true,
  });
  const originals = new Map();
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const name of [
    'HTMLElement',
    'HTMLInputElement',
    'HTMLButtonElement',
    'Element',
    'Node',
    'Document',
    'DocumentFragment',
    'ShadowRoot',
    'MutationObserver',
  ])
    globals[name] = dom.window[name];
  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  return {
    dom,
    restore() {
      dom.window.close();
      for (const [key, previous] of originals) {
        if (previous) Object.defineProperty(globalThis, key, previous);
        else delete globalThis[key];
      }
    },
  };
}
