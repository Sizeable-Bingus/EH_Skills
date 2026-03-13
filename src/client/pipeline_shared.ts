import type { PipelineStatusResponse, StartPipelineRequest } from "../types.ts";

export type StartPipelinePayload = StartPipelineRequest;
export type PipelineStatusPayload = PipelineStatusResponse;

export interface EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener: (
    type: string,
    listener: (event: Event | MessageEvent<string>) => void,
  ) => void;
  close: () => void;
}

export interface WindowLike {
  clearTimeout: (id: number) => void;
  location: { href: string; search: string };
  setTimeout: (handler: () => void, timeout: number) => number;
  alert: (message?: string) => void;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface PipelineUiDependencies {
  document?: Document;
  window?: WindowLike;
  fetchFn?: FetchLike;
  createEventSource?: (url: string) => EventSourceLike;
}

export interface PipelineDomRefs {
  modal: HTMLDivElement;
  targetInput: HTMLInputElement;
  usernameInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
  startButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  openButton: HTMLButtonElement;
  statusBar: HTMLDivElement;
  statusDot: HTMLSpanElement;
  statusText: HTMLSpanElement;
  logToggle: HTMLButtonElement;
  logPanel: HTMLDivElement;
  logPre: HTMLPreElement;
  combobox: HTMLDivElement;
  comboInput: HTMLInputElement;
  listbox: HTMLUListElement;
  deleteButton: HTMLButtonElement;
  deleteModal: HTMLDivElement;
  deleteCancel: HTMLButtonElement;
  deleteConfirm: HTMLButtonElement;
  deleteTargetName: HTMLParagraphElement;
}

function requiredElement<T extends HTMLElement>(
  documentRef: Document,
  HTMLElementCtor: typeof HTMLElement,
  id: string,
): T {
  const element = documentRef.getElementById(id);
  if (!(element instanceof HTMLElementCtor)) {
    throw new Error(`Missing expected element #${id}`);
  }
  return element as T;
}

export function getCurrentParams(windowRef: WindowLike): URLSearchParams {
  return new URLSearchParams(windowRef.location.search);
}

export async function parseErrorDetail(
  response: Response,
): Promise<string | undefined> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail;
  } catch {
    return undefined;
  }
}

export function getPipelineDomRefs(
  documentRef: Document,
  HTMLElementCtor: typeof HTMLElement,
): PipelineDomRefs {
  return {
    modal: requiredElement<HTMLDivElement>(
      documentRef,
      HTMLElementCtor,
      "scan-modal",
    ),
    targetInput: requiredElement<HTMLInputElement>(
      documentRef,
      HTMLElementCtor,
      "scan-target",
    ),
    usernameInput: requiredElement<HTMLInputElement>(
      documentRef,
      HTMLElementCtor,
      "scan-username",
    ),
    passwordInput: requiredElement<HTMLInputElement>(
      documentRef,
      HTMLElementCtor,
      "scan-password",
    ),
    startButton: requiredElement<HTMLButtonElement>(
      documentRef,
      HTMLElementCtor,
      "scan-start",
    ),
    cancelButton: requiredElement<HTMLButtonElement>(
      documentRef,
      HTMLElementCtor,
      "scan-cancel",
    ),
    openButton: requiredElement<HTMLButtonElement>(
      documentRef,
      HTMLElementCtor,
      "scan-open",
    ),
    statusBar: requiredElement<HTMLDivElement>(
      documentRef,
      HTMLElementCtor,
      "pipeline-status",
    ),
    statusDot: requiredElement<HTMLSpanElement>(
      documentRef,
      HTMLElementCtor,
      "pipeline-dot",
    ),
    statusText: requiredElement<HTMLSpanElement>(
      documentRef,
      HTMLElementCtor,
      "pipeline-text",
    ),
    logToggle: requiredElement<HTMLButtonElement>(
      documentRef,
      HTMLElementCtor,
      "log-toggle",
    ),
    logPanel: requiredElement<HTMLDivElement>(
      documentRef,
      HTMLElementCtor,
      "log-panel",
    ),
    logPre: requiredElement<HTMLPreElement>(
      documentRef,
      HTMLElementCtor,
      "log-pre",
    ),
    combobox: requiredElement<HTMLDivElement>(
      documentRef,
      HTMLElementCtor,
      "engagement-combobox",
    ),
    comboInput: requiredElement<HTMLInputElement>(
      documentRef,
      HTMLElementCtor,
      "engagement-input",
    ),
    listbox: requiredElement<HTMLUListElement>(
      documentRef,
      HTMLElementCtor,
      "engagement-listbox",
    ),
    deleteButton: requiredElement<HTMLButtonElement>(
      documentRef,
      HTMLElementCtor,
      "delete-engagement",
    ),
    deleteModal: requiredElement<HTMLDivElement>(
      documentRef,
      HTMLElementCtor,
      "delete-modal",
    ),
    deleteCancel: requiredElement<HTMLButtonElement>(
      documentRef,
      HTMLElementCtor,
      "delete-cancel",
    ),
    deleteConfirm: requiredElement<HTMLButtonElement>(
      documentRef,
      HTMLElementCtor,
      "delete-confirm",
    ),
    deleteTargetName: requiredElement<HTMLParagraphElement>(
      documentRef,
      HTMLElementCtor,
      "delete-target-name",
    ),
  };
}
