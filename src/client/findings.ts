export {
  initializeFindingsPage,
  type FindingsPageDependencies
} from "./findings_page.ts";

import { initializeFindingsPage } from "./findings_page.ts";

if (typeof document !== "undefined") {
  initializeFindingsPage();
}
