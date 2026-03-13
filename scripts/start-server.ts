import { startServer } from "../src/server.tsx";

const engagementsDir = process.env.PENTEST_ENGAGEMENTS_DIR;

await startServer(engagementsDir ? { engagementsDir } : {});
