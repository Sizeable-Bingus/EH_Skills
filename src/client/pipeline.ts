export {
  initializePipelineUi,
  type PipelineUiDependencies
} from "./pipeline_ui.ts";

import { initializePipelineUi } from "./pipeline_ui.ts";

if (typeof document !== "undefined") {
  initializePipelineUi();
}
