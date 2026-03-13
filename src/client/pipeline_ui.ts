import { createDeleteEngagementControls } from "./delete_engagement.ts";
import { createEngagementPickerController } from "./engagement_picker.ts";
import { createScanControls } from "./scan_controls.ts";
import { createPipelineStatusController } from "./pipeline_status.ts";
import type { PipelineUiDependencies } from "./pipeline_shared.ts";
import { getPipelineDomRefs } from "./pipeline_shared.ts";

export type { PipelineUiDependencies } from "./pipeline_shared.ts";

export function initializePipelineUi(
  dependencies: PipelineUiDependencies = {},
): void {
  const documentRef = dependencies.document ?? document;
  const windowRef = dependencies.window ?? window;
  const HTMLElementCtor = documentRef.defaultView?.HTMLElement ?? HTMLElement;
  const fetchFn = dependencies.fetchFn ?? fetch;
  const createEventSource =
    dependencies.createEventSource ?? ((url: string) => new EventSource(url));
  const refs = getPipelineDomRefs(documentRef, HTMLElementCtor);

  const engagementPicker = createEngagementPickerController({
    document: documentRef,
    HTMLElementCtor,
    window: windowRef,
    fetchFn,
    refs,
  });
  const pipelineStatus = createPipelineStatusController({
    createEventSource,
    refs,
    window: windowRef,
    onRunFinished: async () => {
      await engagementPicker.loadEngagements();
      engagementPicker.updateDeleteButtonVisibility();
    },
  });

  createScanControls({
    fetchFn,
    refs,
    window: windowRef,
    onStarted: (target) => {
      pipelineStatus.showStatus("running", "Starting", target);
      pipelineStatus.connect();
    },
  });

  createDeleteEngagementControls({
    fetchFn,
    getCurrentEngagement: engagementPicker.getCurrentEngagement,
    refs,
    window: windowRef,
  });

  async function init(): Promise<void> {
    try {
      await engagementPicker.loadEngagements();
    } catch {
      // Ignore engagement-loading failures during bootstrap.
    }
    engagementPicker.updateDeleteButtonVisibility();

    try {
      const response = await fetchFn("/api/pipeline/status");
      const info = (await response.json()) as {
        status: string;
        target: string;
        current_phase: string;
      };
      if (info.status === "running") {
        pipelineStatus.showStatus("running", info.current_phase, info.target);
        pipelineStatus.connect();
      }
    } catch {
      // Ignore status failures during bootstrap.
    }
  }

  void init();
}
