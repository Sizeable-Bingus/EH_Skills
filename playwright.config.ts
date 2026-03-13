import { defineConfig } from "@playwright/test";
import { join } from "node:path";

const fixtureRoot = join(process.cwd(), "tests", "e2e", "tmp-engagements");
const port = 4174;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: [
      "bun run scripts/build-assets.ts",
      "bun run scripts/prepare-e2e-fixtures.ts",
      `PORT=${port} PENTEST_PIPELINE_MODE=synthetic PENTEST_ENGAGEMENTS_DIR=${fixtureRoot} PENTEST_SKIP_ASSET_BUILD=1 bun run scripts/start-server.ts`,
    ].join(" && "),
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
