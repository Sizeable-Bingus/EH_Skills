export {
  initializeExecutiveSummaryPage,
  type ExecutiveSummaryDependencies
} from "./executive_summary_page.ts";

import { initializeExecutiveSummaryPage } from "./executive_summary_page.ts";

if (typeof document !== "undefined") {
  initializeExecutiveSummaryPage();
}
