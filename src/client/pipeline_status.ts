import type {
  EventSourceLike,
  PipelineDomRefs,
  PipelineStatusPayload,
  WindowLike,
} from "./pipeline_shared.ts";

interface PipelineStatusOptions {
  createEventSource: (url: string) => EventSourceLike;
  refs: Pick<
    PipelineDomRefs,
    | "statusBar"
    | "statusDot"
    | "statusText"
    | "logToggle"
    | "logPanel"
    | "logPre"
  >;
  window: WindowLike;
  onRunFinished: () => void | Promise<void>;
}

export function createPipelineStatusController(options: PipelineStatusOptions) {
  const { createEventSource, refs, window, onRunFinished } = options;
  let currentTarget = "";
  let eventSource: EventSourceLike | null = null;
  let autoHideTimer: number | null = null;
  let scanFinished = false;

  function showStatus(status: string, phase: string, target: string): void {
    if (target) {
      currentTarget = target;
    }

    refs.statusBar.classList.remove("hidden");
    refs.statusText.textContent = currentTarget
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

    refs.statusDot.className = `pipeline-dot ${dotState}`;
  }

  function clearAutoHide(): void {
    if (autoHideTimer !== null) {
      window.clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  }

  function scheduleAutoHide(): void {
    scanFinished = true;
    clearAutoHide();
    if (!refs.logPanel.classList.contains("hidden")) {
      return;
    }
    autoHideTimer = window.setTimeout(() => {
      refs.statusBar.classList.add("hidden");
    }, 5_000);
  }

  function connect(): void {
    if (eventSource) {
      eventSource.close();
    }

    refs.logPre.textContent = "";
    eventSource = createEventSource("/api/pipeline/stream");

    eventSource.onmessage = (event: MessageEvent<string>) => {
      const data = event.data;
      refs.logPre.textContent += `${data}\n`;
      refs.logPre.scrollTop = refs.logPre.scrollHeight;
      const match = data.match(/PHASE:\s*(.+)/);
      const phase = match?.[1];
      if (phase) {
        showStatus("running", phase.trim(), currentTarget);
      }
    };

    eventSource.addEventListener("done", (event) => {
      const info = JSON.parse(
        (event as MessageEvent<string>).data,
      ) as PipelineStatusPayload;
      showStatus(info.status, info.current_phase, info.target);
      eventSource?.close();
      eventSource = null;
      void Promise.resolve(onRunFinished());
      scheduleAutoHide();
    });

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
    };
  }

  refs.logToggle.addEventListener("click", () => {
    refs.logPanel.classList.toggle("hidden");
    refs.logToggle.textContent = refs.logPanel.classList.contains("hidden")
      ? "Show Log"
      : "Hide Log";
    if (scanFinished) {
      clearAutoHide();
      if (refs.logPanel.classList.contains("hidden")) {
        scheduleAutoHide();
      }
    }
  });

  return {
    connect,
    showStatus,
  };
}
