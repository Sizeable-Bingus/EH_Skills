export {
  initializeDashboardPage,
  type DashboardPageDependencies,
} from "./dashboard_page.ts";

import { initializeDashboardPage } from "./dashboard_page.ts";

if (typeof document !== "undefined") {
  initializeDashboardPage();
}
