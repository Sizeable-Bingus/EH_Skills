import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  ChartStub,
  createDom,
  EventSourceStub,
  installDomGlobals
} from "./helpers/dom.ts";
import { initializeDashboardPage } from "../src/client/dashboard_page.ts";
import { initializeExecutiveSummaryPage } from "../src/client/executive_summary_page.ts";
import { initializeFindingsPage } from "../src/client/findings_page.ts";
import { initializePipelineUi } from "../src/client/pipeline_ui.ts";

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

async function importClientModule<T>(path: string): Promise<T> {
  return (await import(`${path}?test=${Math.random()}`)) as T;
}

function createPipelineHtml(): string {
  return `
    <div id="scan-modal" class="hidden"></div>
    <input id="scan-target" />
    <input id="scan-username" />
    <input id="scan-password" />
    <button id="scan-start" type="button"></button>
    <button id="scan-cancel" type="button"></button>
    <button id="scan-open" type="button"></button>
    <div id="pipeline-status" class="hidden"></div>
    <span id="pipeline-dot" class="pipeline-dot pipeline-dot--idle"></span>
    <span id="pipeline-text"></span>
    <button id="log-toggle" type="button">Show Log</button>
    <div id="log-panel" class="hidden"></div>
    <pre id="log-pre"></pre>
    <div id="engagement-combobox" class="combobox"></div>
    <input id="engagement-input" />
    <ul id="engagement-listbox" class="hidden"></ul>
    <button id="delete-engagement" type="button" class="hidden"></button>
    <div id="delete-modal" class="hidden"></div>
    <button id="delete-cancel" type="button"></button>
    <button id="delete-confirm" type="button"></button>
    <p id="delete-target-name"></p>
  `;
}

describe("client findings page", () => {
  test("exercises default DOM helper stubs", () => {
    const dom = createDom("<input id='name' /><div id='box'></div>");
    const input = dom.document.getElementById("name") as HTMLInputElement;
    const box = dom.document.getElementById("box") as HTMLElement;

    let fired = false;
    const timerId = dom.window.setTimeout(() => {
      fired = true;
    }, 10);
    dom.window.clearTimeout(timerId);
    dom.runTimers();
    expect(fired).toBe(false);

    dom.window.setTimeout(() => {
      fired = true;
    }, 10);
    dom.runTimers();
    expect(fired).toBe(true);

    expect(() => dom.window.alert("noop")).not.toThrow();
    expect(() => input.select()).not.toThrow();
    expect(() => box.scrollIntoView()).not.toThrow();
  });

  test("toggles detail rows and ignores incomplete markup", async () => {
    const dom = createDom(`
      <button data-detail-toggle data-id="1" aria-expanded="false"></button>
      <button data-detail-toggle aria-expanded="false"></button>
      <button data-detail-toggle data-id="2" aria-expanded="false"></button>
      <span id="arrow-1"></span>
      <tr id="detail-1" class="hidden"></tr>
    `);
    const restore = installDomGlobals(dom.window);

    try {
      initializeFindingsPage({ document: dom.document });

      const button = dom.document.querySelector(
        '[data-id="1"]'
      ) as HTMLButtonElement;
      button.click();
      expect(
        dom.document.getElementById("detail-1")?.classList.contains("hidden")
      ).toBe(false);
      expect(
        dom.document.getElementById("arrow-1")?.getAttribute("style")
      ).toBe("transform:rotate(90deg)");
      expect(button.getAttribute("aria-expanded")).toBe("true");

      button.click();
      expect(
        dom.document.getElementById("detail-1")?.classList.contains("hidden")
      ).toBe(true);
    } finally {
      restore();
    }
  });

  test("ignores buttons without ids or missing detail markup", () => {
    const dom = createDom(`
      <button data-detail-toggle aria-expanded="false" id="missing-id"></button>
      <button data-detail-toggle data-id="2" aria-expanded="false" id="missing-row"></button>
    `);
    const restore = installDomGlobals(dom.window);

    try {
      initializeFindingsPage({ document: dom.document });
      (dom.document.getElementById("missing-id") as HTMLButtonElement).click();
      (dom.document.getElementById("missing-row") as HTMLButtonElement).click();
      expect(
        (
          dom.document.getElementById("missing-id") as HTMLButtonElement
        ).getAttribute("aria-expanded")
      ).toBe("false");
    } finally {
      restore();
    }
  });
});

describe("client chart pages", () => {
  beforeEach(() => {
    ChartStub.reset();
  });

  test("initializes dashboard charts and row navigation", async () => {
    const importDom = createDom("<div></div>");
    const restore = installDomGlobals(importDom.window);

    try {
      const dom = createDom(
        `
          <div
            id="dashboard-chart-data"
            data-severity-counts='{"critical":1,"high":2}'
            data-category-counts='[{"category":"xss","count":3}]'
          ></div>
          <canvas id="severityChart"></canvas>
          <canvas id="categoryChart"></canvas>
          <div class="dashboard-engagement-row" data-engagement="demo"></div>
        `
      );
      initializeDashboardPage({
        document: dom.document,
        window: dom.window,
        chartConstructor: ChartStub
      });

      expect(ChartStub.instances).toHaveLength(2);
      expect(ChartStub.defaults.font.family).toContain("Montserrat");
      (
        dom.document.querySelector(".dashboard-engagement-row") as HTMLElement
      ).click();
      expect(dom.window.location.href).toBe("/summary?engagement=demo");
    } finally {
      restore();
    }
  });

  test("handles invalid chart JSON and missing chart container", async () => {
    const importDom = createDom("<div></div>");
    const restore = installDomGlobals(importDom.window);

    try {
      const invalid = createDom(`
        <div
          id="dashboard-chart-data"
          data-severity-counts="not-json"
          data-category-counts="still-not-json"
        ></div>
        <canvas id="severityChart"></canvas>
        <canvas id="categoryChart"></canvas>
      `);
      initializeDashboardPage({
        document: invalid.document,
        window: invalid.window,
        chartConstructor: ChartStub
      });
      expect(ChartStub.instances).toHaveLength(2);

      ChartStub.reset();
      const missing = createDom("<div></div>");
      initializeDashboardPage({
        document: missing.document,
        window: missing.window,
        chartConstructor: ChartStub
      });
      expect(ChartStub.instances).toHaveLength(0);
    } finally {
      restore();
    }
  });

  test("falls back when chart data attributes are missing", () => {
    const dom = createDom(`
      <div id="dashboard-chart-data"></div>
      <canvas id="severityChart"></canvas>
      <canvas id="categoryChart"></canvas>
      <div id="summary-chart-data"></div>
      <canvas id="severityChart"></canvas>
      <canvas id="categoryChart"></canvas>
    `);
    const restore = installDomGlobals(dom.window);

    try {
      initializeDashboardPage({
        document: dom.document,
        window: dom.window,
        chartConstructor: ChartStub
      });
      expect(ChartStub.instances).toHaveLength(2);

      ChartStub.reset();
      initializeExecutiveSummaryPage({
        document: dom.document,
        chartConstructor: ChartStub
      });
      expect(ChartStub.instances).toHaveLength(2);
    } finally {
      restore();
    }
  });

  test("ignores dashboard rows without engagement ids", () => {
    const dom = createDom(`
      <div
        id="dashboard-chart-data"
        data-severity-counts='{}'
        data-category-counts='[]'
      ></div>
      <div class="dashboard-engagement-row"></div>
    `);
    const restore = installDomGlobals(dom.window);

    try {
      initializeDashboardPage({
        document: dom.document,
        window: dom.window,
        chartConstructor: ChartStub
      });
      (
        dom.document.querySelector(".dashboard-engagement-row") as HTMLElement
      ).click();
      expect(dom.window.location.href).toBe("https://example.test/");
    } finally {
      restore();
    }
  });

  test("initializes executive summary charts and tolerates bad data", async () => {
    const importDom = createDom("<div></div>");
    const restore = installDomGlobals(importDom.window);

    try {
      const valid = createDom(
        `
          <div
            id="summary-chart-data"
            data-severity-counts='{"medium":4}'
            data-category-counts='[{"category":"idor","count":2}]'
          ></div>
          <canvas id="severityChart"></canvas>
          <canvas id="categoryChart"></canvas>
        `
      );
      initializeExecutiveSummaryPage({
        document: valid.document,
        chartConstructor: ChartStub
      });
      expect(ChartStub.instances).toHaveLength(2);

      ChartStub.reset();
      const invalid = createDom(`
        <div
          id="summary-chart-data"
          data-severity-counts="nope"
          data-category-counts="nope"
        ></div>
        <canvas id="severityChart"></canvas>
        <canvas id="categoryChart"></canvas>
      `);
      initializeExecutiveSummaryPage({
        document: invalid.document,
        chartConstructor: ChartStub
      });
      expect(ChartStub.instances).toHaveLength(2);
    } finally {
      restore();
    }
  });

  test("returns early when summary chart data is missing", () => {
    const dom = createDom("<div></div>");
    const restore = installDomGlobals(dom.window);

    try {
      initializeExecutiveSummaryPage({
        document: dom.document,
        chartConstructor: ChartStub
      });
      expect(ChartStub.instances).toHaveLength(0);
    } finally {
      restore();
    }
  });
});

describe("pipeline UI", () => {
  beforeEach(() => {
    EventSourceStub.reset();
  });

  test("treats bootstrap fetch failures as non-fatal", async () => {
    const dom = createDom(createPipelineHtml());
    const restore = installDomGlobals(dom.window);
    const previousFetch = globalThis.fetch;
    const previousEventSource = globalThis.EventSource;

    try {
      globalThis.fetch = (async () => {
        throw new Error("network");
      }) as unknown as typeof fetch;
      globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

      initializePipelineUi({
        document: dom.document,
        window: dom.window,
        fetchFn: globalThis.fetch,
        createEventSource: (url) => new EventSourceStub(url)
      });
      await flushMicrotasks();

      expect(
        dom.document
          .getElementById("delete-engagement")
          ?.classList.contains("hidden")
      ).toBe(true);
    } finally {
      restore();
      globalThis.fetch = previousFetch;
      globalThis.EventSource = previousEventSource;
    }
  });

  test("opens the scan modal, starts a scan, streams logs, and auto-hides status", async () => {
    const dom = createDom(
      createPipelineHtml(),
      "https://example.test/?engagement=demo"
    );
    const restore = installDomGlobals(dom.window);
    const previousFetch = globalThis.fetch;
    const previousEventSource = globalThis.EventSource;
    const alerts: string[] = [];
    const requests: Array<{
      url: string;
      method: string;
      body: string | undefined;
    }> = [];

    try {
      dom.window.alert = (message) => {
        alerts.push(message ?? "");
      };
      globalThis.fetch = (async (
        input: string | URL | Request,
        init?: RequestInit
      ) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        requests.push({
          url,
          method,
          body: typeof init?.body === "string" ? init.body : undefined
        });
        if (url === "/api/engagements") {
          return Response.json(["demo", "beta", "default"]);
        }
        if (url === "/api/pipeline/status") {
          return Response.json({
            status: "idle",
            target: "",
            current_phase: ""
          });
        }
        if (url === "/api/pipeline/start") {
          return Response.json({ status: "started" });
        }
        throw new Error(`Unexpected request: ${url}`);
      }) as unknown as typeof fetch;
      globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

      initializePipelineUi({
        document: dom.document,
        window: dom.window,
        fetchFn: globalThis.fetch,
        createEventSource: (url) => new EventSourceStub(url)
      });
      await flushMicrotasks();

      (dom.document.getElementById("scan-open") as HTMLButtonElement).click();
      expect(
        dom.document.getElementById("scan-modal")?.classList.contains("hidden")
      ).toBe(false);

      (dom.document.getElementById("scan-target") as HTMLInputElement).value =
        "https://demo.example";
      (dom.document.getElementById("scan-username") as HTMLInputElement).value =
        "demo-user";
      (dom.document.getElementById("scan-password") as HTMLInputElement).value =
        "secret";
      (
        dom.document.getElementById("scan-start") as HTMLButtonElement
      ).dispatchEvent(new dom.window.Event("click"));
      await flushMicrotasks();
      await flushMicrotasks();

      expect(alerts).toEqual([]);
      expect(
        requests.find((request) => request.url === "/api/pipeline/start")
      ).toEqual({
        url: "/api/pipeline/start",
        method: "POST",
        body: '{"target":"https://demo.example","username":"demo-user","password":"secret"}'
      });
      expect(EventSourceStub.instances).toHaveLength(1);

      const source = EventSourceStub.instances[0] as EventSourceStub;
      source.emitMessage("PHASE: Demo");
      source.emit(
        "done",
        JSON.stringify({
          status: "complete",
          current_phase: "Complete",
          target: "https://demo.example"
        })
      );
      await flushMicrotasks();

      expect(
        dom.document.getElementById("pipeline-text")?.textContent
      ).toContain("Complete");
      expect(dom.document.getElementById("log-pre")?.textContent).toContain(
        "PHASE: Demo"
      );

      const toggle = dom.document.getElementById(
        "log-toggle"
      ) as HTMLButtonElement;
      toggle.click();
      expect(
        dom.document.getElementById("log-panel")?.classList.contains("hidden")
      ).toBe(false);
      toggle.click();
      dom.runTimers();
      expect(
        dom.document
          .getElementById("pipeline-status")
          ?.classList.contains("hidden")
      ).toBe(true);
    } finally {
      restore();
      globalThis.fetch = previousFetch;
      globalThis.EventSource = previousEventSource;
    }
  });

  test("handles combobox navigation and blur reset", async () => {
    const dom = createDom(
      createPipelineHtml(),
      "https://example.test/?engagement=demo"
    );
    const restore = installDomGlobals(dom.window);
    const previousFetch = globalThis.fetch;
    const previousEventSource = globalThis.EventSource;

    try {
      globalThis.fetch = (async (input: string | URL | Request) => {
        if (String(input) === "/api/engagements") {
          return Response.json(["demo", "beta"]);
        }
        return Response.json({
          status: "idle",
          target: "",
          current_phase: ""
        });
      }) as unknown as typeof fetch;
      globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

      initializePipelineUi({
        document: dom.document,
        window: dom.window,
        fetchFn: globalThis.fetch,
        createEventSource: (url) => new EventSourceStub(url)
      });
      await flushMicrotasks();

      const input = dom.document.getElementById(
        "engagement-input"
      ) as HTMLInputElement;
      input.dispatchEvent(new dom.window.Event("focus"));
      expect(
        dom.document
          .getElementById("engagement-listbox")
          ?.classList.contains("hidden")
      ).toBe(false);

      input.value = "be";
      input.dispatchEvent(new dom.window.Event("input"));
      expect(
        dom.document.getElementById("engagement-listbox")?.textContent
      ).toContain("beta");

      const arrowDown = new dom.window.Event("keydown", {
        bubbles: true
      }) as Event & { key: string };
      arrowDown.key = "ArrowDown";
      input.dispatchEvent(arrowDown);
      const enter = new dom.window.Event("keydown", {
        bubbles: true
      }) as Event & { key: string };
      enter.key = "Enter";
      input.dispatchEvent(enter);
      expect(dom.window.location.search).toBe("engagement=beta");

      dom.window.location.search = "?engagement=demo";
      input.value = "custom";
      input.dispatchEvent(new dom.window.Event("blur"));
      expect(input.value).toBe("demo");
    } finally {
      restore();
      globalThis.fetch = previousFetch;
      globalThis.EventSource = previousEventSource;
    }
  });

  test("keeps the status visible when logs are open and supports mouse and escape branches", async () => {
    const dom = createDom(
      createPipelineHtml(),
      "https://example.test/?engagement=demo"
    );
    const restore = installDomGlobals(dom.window);
    const previousFetch = globalThis.fetch;
    const previousEventSource = globalThis.EventSource;

    try {
      globalThis.fetch = (async (input: string | URL | Request) => {
        if (String(input) === "/api/engagements") {
          return Response.json(["demo", "beta"]);
        }
        return Response.json({
          status: "idle",
          target: "",
          current_phase: ""
        });
      }) as unknown as typeof fetch;
      globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

      initializePipelineUi({
        document: dom.document,
        window: dom.window,
        fetchFn: globalThis.fetch,
        createEventSource: (url) => new EventSourceStub(url)
      });
      await flushMicrotasks();

      const input = dom.document.getElementById(
        "engagement-input"
      ) as HTMLInputElement;
      const toggle = dom.document.getElementById(
        "log-toggle"
      ) as HTMLButtonElement;

      toggle.click();
      expect(
        dom.document.getElementById("log-panel")?.classList.contains("hidden")
      ).toBe(false);

      (dom.document.getElementById("scan-open") as HTMLButtonElement).click();
      (dom.document.getElementById("scan-target") as HTMLInputElement).value =
        "https://demo.example";
      (
        dom.document.getElementById("scan-start") as HTMLButtonElement
      ).dispatchEvent(new dom.window.Event("click"));
      await flushMicrotasks();
      await flushMicrotasks();

      const source = EventSourceStub.instances[0] as EventSourceStub;
      source.emit(
        "done",
        JSON.stringify({
          status: "complete",
          current_phase: "Complete",
          target: "https://demo.example"
        })
      );
      await flushMicrotasks();
      dom.runTimers();
      expect(
        dom.document
          .getElementById("pipeline-status")
          ?.classList.contains("hidden")
      ).toBe(false);

      input.dispatchEvent(new dom.window.Event("focus"));
      const arrowDown = new dom.window.Event("keydown", {
        bubbles: true
      }) as Event & { key: string };
      arrowDown.key = "ArrowDown";
      input.dispatchEvent(arrowDown);
      input.dispatchEvent(new dom.window.Event("focus"));

      const option = dom.document.querySelector(".combobox-option");
      if (!(option instanceof dom.window.HTMLElement)) {
        throw new Error("Expected a combobox option");
      }
      option.dispatchEvent(
        new dom.window.Event("mousedown", {
          bubbles: true,
          cancelable: true
        })
      );
      expect(dom.window.location.search.startsWith("engagement=")).toBe(true);

      dom.window.location.search = "?engagement=demo";
      const listbox = dom.document.getElementById(
        "engagement-listbox"
      ) as HTMLUListElement;
      listbox.innerHTML = '<li class="combobox-option"></li>';
      input.dispatchEvent(arrowDown);
      const enter = new dom.window.Event("keydown", {
        bubbles: true
      }) as Event & { key: string };
      enter.key = "Enter";
      input.dispatchEvent(enter);
      expect(dom.window.location.search).toBe("");

      listbox.innerHTML = '<li class="combobox-option">demo</li>';
      input.dispatchEvent(new dom.window.Event("focus", { bubbles: true }));
      const escape = new dom.window.Event("keydown", {
        bubbles: true
      }) as Event & { key: string };
      escape.key = "Escape";
      input.dispatchEvent(escape);
      expect(listbox.classList.contains("hidden")).toBe(true);
    } finally {
      restore();
      globalThis.fetch = previousFetch;
      globalThis.EventSource = previousEventSource;
    }
  });

  test("shows pipeline start and delete errors without crashing", async () => {
    const dom = createDom(
      createPipelineHtml(),
      "https://example.test/?engagement=demo"
    );
    const restore = installDomGlobals(dom.window);
    const previousFetch = globalThis.fetch;
    const previousEventSource = globalThis.EventSource;
    const alerts: string[] = [];

    try {
      dom.window.alert = (message) => {
        alerts.push(message ?? "");
      };
      globalThis.fetch = (async (
        input: string | URL | Request,
        init?: RequestInit
      ) => {
        const url = String(input);
        if (url === "/api/engagements") {
          return Response.json(["demo"]);
        }
        if (url === "/api/pipeline/status") {
          return Response.json({
            status: "running",
            target: "https://demo.example",
            current_phase: "Queued"
          });
        }
        if (url === "/api/pipeline/start") {
          return new Response(JSON.stringify({ detail: "start failed" }), {
            status: 409,
            headers: { "Content-Type": "application/json" }
          });
        }
        if (url === "/api/engagements/demo" && init?.method === "DELETE") {
          return new Response(JSON.stringify({ detail: "delete failed" }), {
            status: 409,
            headers: { "Content-Type": "application/json" }
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }) as unknown as typeof fetch;
      globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

      initializePipelineUi({
        document: dom.document,
        window: dom.window,
        fetchFn: globalThis.fetch,
        createEventSource: (url) => new EventSourceStub(url)
      });
      await flushMicrotasks();

      (dom.document.getElementById("scan-open") as HTMLButtonElement).click();
      (dom.document.getElementById("scan-target") as HTMLInputElement).value =
        "https://demo.example";
      (
        dom.document.getElementById("scan-start") as HTMLButtonElement
      ).dispatchEvent(new dom.window.Event("click"));
      await flushMicrotasks();
      await flushMicrotasks();

      (
        dom.document.getElementById("delete-engagement") as HTMLButtonElement
      ).click();
      expect(
        dom.document.getElementById("delete-target-name")?.textContent
      ).toBe("demo");
      (
        dom.document.getElementById("delete-cancel") as HTMLButtonElement
      ).click();
      (
        dom.document.getElementById("delete-engagement") as HTMLButtonElement
      ).click();
      (
        dom.document.getElementById("delete-confirm") as HTMLButtonElement
      ).dispatchEvent(new dom.window.Event("click"));
      await flushMicrotasks();
      await flushMicrotasks();

      expect(alerts).toEqual(["start failed", "delete failed"]);
    } finally {
      restore();
      globalThis.fetch = previousFetch;
      globalThis.EventSource = previousEventSource;
    }
  });

  test("falls back to generic error messages for non-JSON failures", async () => {
    const dom = createDom(
      createPipelineHtml(),
      "https://example.test/?engagement=demo"
    );
    const restore = installDomGlobals(dom.window);
    const previousFetch = globalThis.fetch;
    const previousEventSource = globalThis.EventSource;
    const alerts: string[] = [];

    try {
      dom.window.alert = (message) => {
        alerts.push(message ?? "");
      };
      globalThis.fetch = (async (
        input: string | URL | Request,
        init?: RequestInit
      ) => {
        const url = String(input);
        if (url === "/api/engagements") {
          return Response.json(["demo"]);
        }
        if (url === "/api/pipeline/status") {
          return Response.json({
            status: "idle",
            target: "",
            current_phase: ""
          });
        }
        if (url === "/api/pipeline/start") {
          return new Response("start failed", { status: 409 });
        }
        if (url === "/api/engagements/demo" && init?.method === "DELETE") {
          return new Response("delete failed", { status: 409 });
        }
        throw new Error(`Unexpected request: ${url}`);
      }) as unknown as typeof fetch;
      globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

      initializePipelineUi({
        document: dom.document,
        window: dom.window,
        fetchFn: globalThis.fetch,
        createEventSource: (url) => new EventSourceStub(url)
      });
      await flushMicrotasks();
      await flushMicrotasks();

      (dom.document.getElementById("scan-open") as HTMLButtonElement).click();
      (dom.document.getElementById("scan-target") as HTMLInputElement).value =
        "https://demo.example";
      (
        dom.document.getElementById("scan-start") as HTMLButtonElement
      ).dispatchEvent(new dom.window.Event("click"));
      await flushMicrotasks();
      await flushMicrotasks();

      (
        dom.document.getElementById("delete-engagement") as HTMLButtonElement
      ).click();
      (
        dom.document.getElementById("delete-confirm") as HTMLButtonElement
      ).dispatchEvent(new dom.window.Event("click"));
      await flushMicrotasks();
      await flushMicrotasks();

      expect(alerts).toEqual([
        "Failed to start pipeline",
        "Failed to delete engagement"
      ]);
    } finally {
      restore();
      globalThis.fetch = previousFetch;
      globalThis.EventSource = previousEventSource;
    }
  });

  test("deletes the current engagement and redirects to the dashboard", async () => {
    const dom = createDom(
      createPipelineHtml(),
      "https://example.test/?engagement=demo"
    );
    const restore = installDomGlobals(dom.window);
    const previousFetch = globalThis.fetch;
    const previousEventSource = globalThis.EventSource;

    try {
      globalThis.fetch = (async (
        input: string | URL | Request,
        init?: RequestInit
      ) => {
        const url = String(input);
        if (url === "/api/engagements") {
          return Response.json(["demo"]);
        }
        if (url === "/api/pipeline/status") {
          return Response.json({
            status: "idle",
            target: "",
            current_phase: ""
          });
        }
        if (url === "/api/engagements/demo" && init?.method === "DELETE") {
          return Response.json({ status: "deleted" });
        }
        throw new Error(`Unexpected request: ${url}`);
      }) as unknown as typeof fetch;
      globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

      initializePipelineUi({
        document: dom.document,
        window: dom.window,
        fetchFn: globalThis.fetch,
        createEventSource: (url) => new EventSourceStub(url)
      });
      await flushMicrotasks();

      (
        dom.document.getElementById("delete-engagement") as HTMLButtonElement
      ).click();
      (
        dom.document.getElementById("delete-confirm") as HTMLButtonElement
      ).click();
      await flushMicrotasks();

      expect(dom.window.location.href).toBe("/");
    } finally {
      restore();
      globalThis.fetch = previousFetch;
      globalThis.EventSource = previousEventSource;
    }
  });

  test("ignores delete confirmation when nothing is selected", async () => {
    const dom = createDom(createPipelineHtml());
    const restore = installDomGlobals(dom.window);
    const previousFetch = globalThis.fetch;
    const previousEventSource = globalThis.EventSource;
    const requests: string[] = [];

    try {
      globalThis.fetch = (async (input: string | URL | Request) => {
        requests.push(String(input));
        if (String(input) === "/api/engagements") {
          return Response.json(["demo"]);
        }
        return Response.json({
          status: "idle",
          target: "",
          current_phase: ""
        });
      }) as unknown as typeof fetch;
      globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

      initializePipelineUi({
        document: dom.document,
        window: dom.window,
        fetchFn: globalThis.fetch,
        createEventSource: (url) => new EventSourceStub(url)
      });
      await flushMicrotasks();
      await flushMicrotasks();

      (
        dom.document.getElementById("delete-confirm") as HTMLButtonElement
      ).click();
      expect(requests).not.toContain("/api/engagements/demo");
      expect(dom.window.location.href).toBe("https://example.test/");
    } finally {
      restore();
      globalThis.fetch = previousFetch;
      globalThis.EventSource = previousEventSource;
    }
  });

  test("covers remaining guards and keyboard branches", async () => {
    const dom = createDom(
      createPipelineHtml(),
      "https://example.test/?engagement=demo"
    );
    const restore = installDomGlobals(dom.window);
    const previousFetch = globalThis.fetch;
    const previousEventSource = globalThis.EventSource;
    const alerts: string[] = [];

    try {
      dom.window.alert = (message) => {
        alerts.push(message ?? "");
      };
      globalThis.fetch = (async (input: string | URL | Request) => {
        if (String(input) === "/api/engagements") {
          return Response.json(["demo"]);
        }
        return Response.json({
          status: "error",
          target: "https://demo.example",
          current_phase: "Failed"
        });
      }) as unknown as typeof fetch;
      globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

      expect(() =>
        initializePipelineUi({
          document: createDom("<div></div>").document,
          window: dom.window,
          fetchFn: globalThis.fetch,
          createEventSource: (url) => new EventSourceStub(url)
        })
      ).toThrow("Missing expected element #scan-modal");

      initializePipelineUi({
        document: dom.document,
        window: dom.window,
        fetchFn: globalThis.fetch,
        createEventSource: (url) => new EventSourceStub(url)
      });
      await flushMicrotasks();

      (dom.document.getElementById("scan-open") as HTMLButtonElement).click();
      (dom.document.getElementById("scan-cancel") as HTMLButtonElement).click();
      expect(
        dom.document.getElementById("scan-modal")?.classList.contains("hidden")
      ).toBe(true);

      (
        dom.document.getElementById("scan-start") as HTMLButtonElement
      ).dispatchEvent(new dom.window.Event("click"));
      expect(alerts).toEqual([]);

      const input = dom.document.getElementById(
        "engagement-input"
      ) as HTMLInputElement;
      input.dispatchEvent(new dom.window.Event("focus"));
      input.dispatchEvent(new dom.window.Event("mouseup"));
      input.value = "zzz";
      input.dispatchEvent(new dom.window.Event("input"));
      expect(
        dom.document.getElementById("engagement-listbox")?.textContent
      ).toContain("No matches");

      const escape = new dom.window.Event("keydown", {
        bubbles: true
      }) as Event & { key: string };
      escape.key = "Escape";
      input.dispatchEvent(escape);

      input.value = "";
      input.dispatchEvent(new dom.window.Event("input"));
      const up = new dom.window.Event("keydown", {
        bubbles: true
      }) as Event & { key: string };
      up.key = "ArrowUp";
      input.dispatchEvent(up);
      const enter = new dom.window.Event("keydown", {
        bubbles: true
      }) as Event & { key: string };
      enter.key = "Enter";
      input.dispatchEvent(enter);
      expect(dom.window.location.search).toBe("engagement=demo");

      const sourceA = new EventSourceStub("/api/pipeline/stream");
      const sourceB = new EventSourceStub("/api/pipeline/stream");
      initializePipelineUi({
        document: dom.document,
        window: dom.window,
        fetchFn: async (request) => {
          if (String(request) === "/api/engagements") {
            return Response.json(["demo"]);
          }
          return Response.json({
            status: "running",
            target: "https://demo.example",
            current_phase: "Queued"
          });
        },
        createEventSource: (() => {
          let first = true;
          return () => {
            const eventSource = first ? sourceA : sourceB;
            first = false;
            return eventSource;
          };
        })()
      });
      await flushMicrotasks();
      await flushMicrotasks();
      (dom.document.getElementById("scan-target") as HTMLInputElement).value =
        "https://demo.example";
      (
        dom.document.getElementById("scan-start") as HTMLButtonElement
      ).dispatchEvent(new dom.window.Event("click"));
      await flushMicrotasks();
      expect(sourceA.closed).toBe(true);
      sourceB.fail();
      expect(sourceB.closed).toBe(true);

      const toggle = dom.document.getElementById(
        "log-toggle"
      ) as HTMLButtonElement;
      toggle.click();
      sourceB.emit(
        "done",
        JSON.stringify({
          status: "error",
          current_phase: "Failed",
          target: "https://demo.example"
        })
      );
      dom.runTimers();
      expect(
        dom.document
          .getElementById("pipeline-status")
          ?.classList.contains("hidden")
      ).toBe(false);
      toggle.click();
      dom.runTimers();
      expect(
        dom.document
          .getElementById("pipeline-status")
          ?.classList.contains("hidden")
      ).toBe(false);
    } finally {
      restore();
      globalThis.fetch = previousFetch;
      globalThis.EventSource = previousEventSource;
    }
  });
});

describe("client auto-bootstrap", () => {
  let restoreGlobals: (() => void) | null = null;
  const previousFetch = globalThis.fetch;
  const previousEventSource = globalThis.EventSource;

  afterEach(() => {
    restoreGlobals?.();
    restoreGlobals = null;
    globalThis.fetch = previousFetch;
    globalThis.EventSource = previousEventSource;
  });

  test("initializes modules automatically when document exists", async () => {
    const dom = createDom(createPipelineHtml());
    restoreGlobals = installDomGlobals(dom.window);
    EventSourceStub.reset();
    globalThis.fetch = (async (input: string | URL | Request) => {
      if (String(input) === "/api/engagements") {
        return Response.json([]);
      }
      return Response.json({
        status: "running",
        target: "https://demo.example",
        current_phase: "Queued"
      });
    }) as unknown as typeof fetch;
    globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

    await importClientModule("../src/client/findings.ts");
    await importClientModule("../src/client/dashboard.ts");
    await importClientModule("../src/client/executive_summary.ts");
    await importClientModule("../src/client/pipeline.ts");
    await flushMicrotasks();
    await flushMicrotasks();

    expect(dom.document.getElementById("engagement-listbox")).toBeDefined();
    expect(EventSourceStub.instances.length).toBeGreaterThan(0);
  });
});
