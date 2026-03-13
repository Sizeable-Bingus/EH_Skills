import type {
  FetchLike,
  PipelineDomRefs,
  StartPipelinePayload,
  WindowLike,
} from "./pipeline_shared.ts";
import { parseErrorDetail } from "./pipeline_shared.ts";

interface ScanControlsOptions {
  fetchFn: FetchLike;
  refs: Pick<
    PipelineDomRefs,
    | "modal"
    | "targetInput"
    | "usernameInput"
    | "passwordInput"
    | "startButton"
    | "cancelButton"
    | "openButton"
  >;
  window: WindowLike;
  onStarted: (target: string) => void;
}

export function createScanControls(options: ScanControlsOptions): void {
  const { fetchFn, refs, window, onStarted } = options;

  refs.openButton.addEventListener("click", () => {
    refs.modal.classList.remove("hidden");
    refs.targetInput.value = "";
    refs.usernameInput.value = "";
    refs.passwordInput.value = "";
    refs.targetInput.focus();
  });

  refs.cancelButton.addEventListener("click", () => {
    refs.modal.classList.add("hidden");
  });

  refs.startButton.addEventListener("click", async () => {
    const target = refs.targetInput.value.trim();
    if (!target) {
      return;
    }

    const payload: StartPipelinePayload = { target };
    const username = refs.usernameInput.value.trim();
    const password = refs.passwordInput.value.trim();
    if (username) {
      payload.username = username;
    }
    if (password) {
      payload.password = password;
    }

    refs.modal.classList.add("hidden");
    const response = await fetchFn("/api/pipeline/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      window.alert(
        (await parseErrorDetail(response)) ?? "Failed to start pipeline",
      );
      return;
    }

    onStarted(target);
  });
}
