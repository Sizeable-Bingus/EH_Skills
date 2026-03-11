import { parseHTML } from "linkedom";

export interface TestWindow {
  document: Document;
  location: { href: string; search: string };
  alert: (message?: string) => void;
  setTimeout: (handler: () => void, timeout: number) => number;
  clearTimeout: (id: number) => void;
  Event: typeof Event;
  KeyboardEvent: typeof KeyboardEvent;
  MouseEvent: typeof MouseEvent;
  MessageEvent: typeof MessageEvent;
  HTMLElement: typeof HTMLElement;
  HTMLCanvasElement: typeof HTMLCanvasElement;
  HTMLInputElement: typeof HTMLInputElement;
  [key: string]: unknown;
}

export function createDom(html: string, url = "https://example.test/") {
  const { document, window } = parseHTML(html);
  const location = new URL(url);
  const timers = new Map<number, () => void>();
  let nextTimerId = 1;

  const testWindow = window as unknown as TestWindow;
  testWindow.document = document;
  testWindow.location = {
    href: location.toString(),
    search: location.search
  };
  testWindow.alert = () => undefined;
  testWindow.setTimeout = (handler) => {
    const timerId = nextTimerId;
    nextTimerId += 1;
    timers.set(timerId, handler);
    return timerId;
  };
  testWindow.clearTimeout = (timerId) => {
    timers.delete(timerId);
  };

  const htmlElementPrototype = window.HTMLElement.prototype as {
    scrollIntoView?: () => void;
  };
  if (!("scrollIntoView" in htmlElementPrototype)) {
    htmlElementPrototype.scrollIntoView = () => undefined;
  }
  const htmlInputPrototype = window.HTMLInputElement.prototype as {
    select?: () => void;
  };
  if (!("select" in htmlInputPrototype)) {
    htmlInputPrototype.select = () => undefined;
  }

  return {
    document,
    window: testWindow,
    runTimers(): void {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) {
        callback();
      }
    }
  };
}

export function installDomGlobals(window: TestWindow): () => void {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    HTMLElement: globalThis.HTMLElement,
    HTMLCanvasElement: globalThis.HTMLCanvasElement,
    Event: globalThis.Event,
    KeyboardEvent: globalThis.KeyboardEvent,
    MouseEvent: globalThis.MouseEvent,
    MessageEvent: globalThis.MessageEvent
  };

  const sourceWindow = window as unknown as Window & typeof globalThis;
  globalThis.document = window.document;
  globalThis.window = sourceWindow;
  globalThis.HTMLElement = sourceWindow.HTMLElement;
  globalThis.HTMLCanvasElement = sourceWindow.HTMLCanvasElement;
  globalThis.Event = sourceWindow.Event;
  globalThis.KeyboardEvent = sourceWindow.KeyboardEvent;
  globalThis.MouseEvent = sourceWindow.MouseEvent;
  globalThis.MessageEvent = sourceWindow.MessageEvent;

  return () => {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.HTMLCanvasElement = previous.HTMLCanvasElement;
    globalThis.Event = previous.Event;
    globalThis.KeyboardEvent = previous.KeyboardEvent;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.MessageEvent = previous.MessageEvent;
  };
}

export class ChartStub {
  static defaults = {
    font: {
      family: "",
      weight: 0
    }
  };

  static instances: Array<{ element: Element; config: unknown }> = [];

  constructor(element: Element, config: unknown) {
    ChartStub.instances.push({ element, config });
  }

  static reset(): void {
    ChartStub.instances = [];
    ChartStub.defaults.font.family = "";
    ChartStub.defaults.font.weight = 0;
  }
}

export class EventSourceStub {
  static instances: EventSourceStub[] = [];

  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly listeners = new Map<
    string,
    Array<(event: Event | MessageEvent<string>) => void>
  >();
  closed = false;

  constructor(readonly url: string) {
    EventSourceStub.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: Event | MessageEvent<string>) => void
  ): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  emitMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent<string>);
  }

  emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent<string>);
    }
  }

  fail(): void {
    this.onerror?.();
  }

  close(): void {
    this.closed = true;
  }

  static reset(): void {
    EventSourceStub.instances = [];
  }
}
