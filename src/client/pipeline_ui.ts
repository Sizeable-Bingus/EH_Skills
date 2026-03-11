interface StartPipelinePayload {
  target: string;
  username?: string;
  password?: string;
}

interface PipelineStatusResponse {
  status: string;
  target: string;
  current_phase: string;
}

interface EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: (() => void) | null;
  addEventListener: (
    type: string,
    listener: (event: Event | MessageEvent<string>) => void
  ) => void;
  close: () => void;
}

interface WindowLike {
  clearTimeout: (id: number) => void;
  location: { href: string; search: string };
  setTimeout: (handler: () => void, timeout: number) => number;
  alert: (message?: string) => void;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface PipelineUiDependencies {
  document?: Document;
  window?: WindowLike;
  fetchFn?: FetchLike;
  createEventSource?: (url: string) => EventSourceLike;
}

function requiredElement<T extends HTMLElement>(
  documentRef: Document,
  HTMLElementCtor: typeof HTMLElement,
  id: string
): T {
  const element = documentRef.getElementById(id);
  if (!(element instanceof HTMLElementCtor)) {
    throw new Error(`Missing expected element #${id}`);
  }
  return element as T;
}

export function initializePipelineUi(
  dependencies: PipelineUiDependencies = {}
): void {
  const documentRef = dependencies.document ?? document;
  const windowRef = dependencies.window ?? window;
  const HTMLElementCtor = documentRef.defaultView?.HTMLElement ?? HTMLElement;
  const fetchFn = dependencies.fetchFn ?? fetch;
  const createEventSource =
    dependencies.createEventSource ??
    ((url: string) => new EventSource(url) as EventSourceLike);

  const modal = requiredElement<HTMLDivElement>(
    documentRef,
    HTMLElementCtor,
    "scan-modal"
  );
  const targetInput = requiredElement<HTMLInputElement>(
    documentRef,
    HTMLElementCtor,
    "scan-target"
  );
  const usernameInput = requiredElement<HTMLInputElement>(
    documentRef,
    HTMLElementCtor,
    "scan-username"
  );
  const passwordInput = requiredElement<HTMLInputElement>(
    documentRef,
    HTMLElementCtor,
    "scan-password"
  );
  const startButton = requiredElement<HTMLButtonElement>(
    documentRef,
    HTMLElementCtor,
    "scan-start"
  );
  const cancelButton = requiredElement<HTMLButtonElement>(
    documentRef,
    HTMLElementCtor,
    "scan-cancel"
  );
  const openButton = requiredElement<HTMLButtonElement>(
    documentRef,
    HTMLElementCtor,
    "scan-open"
  );

  const statusBar = requiredElement<HTMLDivElement>(
    documentRef,
    HTMLElementCtor,
    "pipeline-status"
  );
  const statusDot = requiredElement<HTMLSpanElement>(
    documentRef,
    HTMLElementCtor,
    "pipeline-dot"
  );
  const statusText = requiredElement<HTMLSpanElement>(
    documentRef,
    HTMLElementCtor,
    "pipeline-text"
  );
  const logToggle = requiredElement<HTMLButtonElement>(
    documentRef,
    HTMLElementCtor,
    "log-toggle"
  );
  const logPanel = requiredElement<HTMLDivElement>(
    documentRef,
    HTMLElementCtor,
    "log-panel"
  );
  const logPre = requiredElement<HTMLPreElement>(
    documentRef,
    HTMLElementCtor,
    "log-pre"
  );

  const combobox = requiredElement<HTMLDivElement>(
    documentRef,
    HTMLElementCtor,
    "engagement-combobox"
  );
  const comboInput = requiredElement<HTMLInputElement>(
    documentRef,
    HTMLElementCtor,
    "engagement-input"
  );
  const listbox = requiredElement<HTMLUListElement>(
    documentRef,
    HTMLElementCtor,
    "engagement-listbox"
  );

  const deleteButton = requiredElement<HTMLButtonElement>(
    documentRef,
    HTMLElementCtor,
    "delete-engagement"
  );
  const deleteModal = requiredElement<HTMLDivElement>(
    documentRef,
    HTMLElementCtor,
    "delete-modal"
  );
  const deleteCancel = requiredElement<HTMLButtonElement>(
    documentRef,
    HTMLElementCtor,
    "delete-cancel"
  );
  const deleteConfirm = requiredElement<HTMLButtonElement>(
    documentRef,
    HTMLElementCtor,
    "delete-confirm"
  );
  const deleteTargetName = requiredElement<HTMLParagraphElement>(
    documentRef,
    HTMLElementCtor,
    "delete-target-name"
  );

  let allEngagements: Array<{ value: string; label: string }> = [];
  let focusedIndex = -1;
  let currentTarget = "";
  let eventSource: EventSourceLike | null = null;
  let autoHideTimer: number | null = null;
  let scanFinished = false;

  function currentParams(): URLSearchParams {
    return new URLSearchParams(windowRef.location.search);
  }

  function showStatus(status: string, phase: string, target: string): void {
    if (target) {
      currentTarget = target;
    }

    statusBar.classList.remove("hidden");
    statusText.textContent = currentTarget
      ? `${phase} — ${currentTarget}`
      : phase;

    const dotState =
      status === "running"
        ? "pipeline-dot--running"
        : status === "complete"
          ? "pipeline-dot--complete"
          : status === "error"
            ? "pipeline-dot--error"
            : "pipeline-dot--idle";

    statusDot.className = `pipeline-dot ${dotState}`;
  }

  function clearAutoHide(): void {
    if (autoHideTimer !== null) {
      windowRef.clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  }

  async function parseErrorDetail(
    response: Response
  ): Promise<string | undefined> {
    try {
      const payload = (await response.json()) as { detail?: string };
      return payload.detail;
    } catch {
      return undefined;
    }
  }

  function scheduleAutoHide(): void {
    scanFinished = true;
    clearAutoHide();
    if (!logPanel.classList.contains("hidden")) {
      return;
    }
    autoHideTimer = windowRef.setTimeout(() => {
      statusBar.classList.add("hidden");
    }, 5_000);
  }

  function connectSse(): void {
    if (eventSource) {
      eventSource.close();
    }

    logPre.textContent = "";
    eventSource = createEventSource("/api/pipeline/stream");

    eventSource.onmessage = (event: MessageEvent<string>) => {
      const data = event.data;
      logPre.textContent += `${data}\n`;
      logPre.scrollTop = logPre.scrollHeight;
      const match = data.match(/PHASE:\s*(.+)/);
      const phase = match?.[1];
      if (phase) {
        showStatus("running", phase.trim(), currentTarget);
      }
    };

    eventSource.addEventListener("done", (event) => {
      const info = JSON.parse(
        (event as MessageEvent<string>).data
      ) as PipelineStatusResponse;
      showStatus(info.status, info.current_phase, info.target);
      eventSource?.close();
      eventSource = null;
      void loadEngagements();
      scheduleAutoHide();
    });

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
    };
  }

  function openListbox(): void {
    listbox.classList.remove("hidden");
    combobox.classList.add("combobox--open");
    comboInput.setAttribute("aria-expanded", "true");
    renderOptions(comboInput.value);
  }

  function closeListbox(): void {
    listbox.classList.add("hidden");
    combobox.classList.remove("combobox--open");
    comboInput.setAttribute("aria-expanded", "false");
    focusedIndex = -1;
  }

  function renderOptions(filter: string): void {
    const query = filter.toLowerCase().trim();
    const filtered = allEngagements.filter((option) =>
      option.label.toLowerCase().includes(query)
    );
    const current = currentParams().get("engagement") ?? "";

    if (filtered.length === 0) {
      listbox.innerHTML = '<li class="combobox-empty">No matches</li>';
      focusedIndex = -1;
      return;
    }

    listbox.innerHTML = "";
    for (const [index, option] of filtered.entries()) {
      const item = documentRef.createElement("li");
      item.className = "combobox-option";
      item.setAttribute("role", "option");
      item.textContent = option.label;
      item.dataset.value = option.value;
      if (option.value === current) {
        item.classList.add("combobox-option--active");
      }
      if (index === focusedIndex) {
        item.classList.add("combobox-option--focused");
      }
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        selectEngagement(option.value, option.label);
      });
      listbox.appendChild(item);
    }
  }

  function selectEngagement(value: string, label: string): void {
    closeListbox();
    comboInput.value = value ? label : "";
    const params = currentParams();
    if (value) {
      params.set("engagement", value);
    } else {
      params.delete("engagement");
    }
    windowRef.location.search = params.toString();
  }

  function updateFocus(items: NodeListOf<Element>): void {
    items.forEach((item, index) => {
      item.classList.toggle("combobox-option--focused", index === focusedIndex);
      if (index === focusedIndex && item instanceof HTMLElementCtor) {
        item.scrollIntoView({ block: "nearest" });
      }
    });
  }

  async function loadEngagements(): Promise<void> {
    const response = await fetchFn("/api/engagements");
    const data = (await response.json()) as string[];
    const current = currentParams().get("engagement") ?? "";
    allEngagements = data
      .filter((name) => name.toLowerCase() !== "default")
      .map((name) => ({ value: name, label: name }));

    const currentMatch = allEngagements.find(
      (option) => option.value === current
    );
    comboInput.value = currentMatch?.label ?? "";
  }

  function updateDeleteButtonVisibility(): void {
    const engagement = currentParams().get("engagement");
    deleteButton.classList.toggle("hidden", !engagement);
  }

  openButton.addEventListener("click", () => {
    modal.classList.remove("hidden");
    targetInput.value = "";
    usernameInput.value = "";
    passwordInput.value = "";
    targetInput.focus();
  });

  cancelButton.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  startButton.addEventListener("click", async () => {
    const target = targetInput.value.trim();
    if (!target) {
      return;
    }

    const payload: StartPipelinePayload = { target };
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (username) {
      payload.username = username;
    }
    if (password) {
      payload.password = password;
    }

    modal.classList.add("hidden");
    const response = await fetchFn("/api/pipeline/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      windowRef.alert(
        (await parseErrorDetail(response)) ?? "Failed to start pipeline"
      );
      return;
    }

    showStatus("running", "Starting", target);
    connectSse();
  });

  logToggle.addEventListener("click", () => {
    logPanel.classList.toggle("hidden");
    logToggle.textContent = logPanel.classList.contains("hidden")
      ? "Show Log"
      : "Hide Log";
    if (scanFinished) {
      clearAutoHide();
      if (logPanel.classList.contains("hidden")) {
        scheduleAutoHide();
      }
    }
  });

  comboInput.addEventListener("focus", () => {
    comboInput.select();
    openListbox();
    comboInput.addEventListener("mouseup", function preventDeselect(event) {
      event.preventDefault();
      comboInput.removeEventListener("mouseup", preventDeselect);
    });
  });

  comboInput.addEventListener("input", () => {
    focusedIndex = -1;
    renderOptions(comboInput.value);
  });

  comboInput.addEventListener("blur", () => {
    closeListbox();
    const current = currentParams().get("engagement") ?? "";
    const match = allEngagements.find((option) => option.value === current);
    comboInput.value = match?.label ?? "";
  });

  comboInput.addEventListener("keydown", (event) => {
    const items = listbox.querySelectorAll(".combobox-option");
    if (items.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
      updateFocus(items);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      updateFocus(items);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = focusedIndex >= 0 ? items.item(focusedIndex) : null;
      if (item instanceof HTMLElementCtor) {
        selectEngagement(item.dataset.value ?? "", item.textContent ?? "");
      }
    } else if (event.key === "Escape") {
      closeListbox();
      comboInput.blur();
    }
  });

  deleteButton.addEventListener("click", () => {
    const engagement = currentParams().get("engagement") ?? "";
    deleteTargetName.textContent = engagement;
    deleteModal.classList.remove("hidden");
  });

  deleteCancel.addEventListener("click", () => {
    deleteModal.classList.add("hidden");
  });

  deleteConfirm.addEventListener("click", async () => {
    const engagement = currentParams().get("engagement");
    if (!engagement) {
      return;
    }

    deleteModal.classList.add("hidden");
    const response = await fetchFn(
      `/api/engagements/${encodeURIComponent(engagement)}`,
      {
        method: "DELETE"
      }
    );
    if (!response.ok) {
      windowRef.alert(
        (await parseErrorDetail(response)) ?? "Failed to delete engagement"
      );
      return;
    }
    windowRef.location.href = "/";
  });

  async function init(): Promise<void> {
    try {
      await loadEngagements();
    } catch {
      // Ignore engagement-loading failures during bootstrap.
    }
    updateDeleteButtonVisibility();

    try {
      const response = await fetchFn("/api/pipeline/status");
      const info = (await response.json()) as PipelineStatusResponse;
      if (info.status === "running") {
        showStatus("running", info.current_phase, info.target);
        connectSse();
      }
    } catch {
      // Ignore status failures during bootstrap.
    }
  }

  void init();
}
