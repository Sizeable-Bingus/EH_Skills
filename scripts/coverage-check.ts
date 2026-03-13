import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const projectRoot = process.cwd();
const coverageFile = resolve(projectRoot, "coverage", "lcov.info");
const srcRoot = resolve(projectRoot, "src");
const excluded = new Set([
  "src/assets/styles.css",
  "src/types.ts",
  "src/pipeline/types.ts",
]);
const minimumFunctions = Number(
  process.env.COVERAGE_FUNCTIONS_THRESHOLD ?? "100",
);
const minimumLines = Number(process.env.COVERAGE_LINES_THRESHOLD ?? "100");

interface CoverageRecord {
  functionsHit: number;
  functionsFound: number;
  linesHit: number;
  linesFound: number;
}

function collectSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(path));
      continue;
    }
    const relativePath = relative(projectRoot, path).replaceAll("\\", "/");
    if (!relativePath.startsWith("src/")) {
      continue;
    }
    if (!relativePath.endsWith(".ts") && !relativePath.endsWith(".tsx")) {
      continue;
    }
    if (excluded.has(relativePath)) {
      continue;
    }
    files.push(relativePath);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function parseLcov(contents: string): Map<string, CoverageRecord> {
  const records = new Map<string, CoverageRecord>();
  let currentPath = "";

  for (const line of contents.split("\n")) {
    if (line.startsWith("SF:")) {
      currentPath = relative(
        projectRoot,
        resolve(projectRoot, line.slice(3)),
      ).replaceAll("\\", "/");
      records.set(currentPath, {
        functionsHit: 0,
        functionsFound: 0,
        linesHit: 0,
        linesFound: 0,
      });
      continue;
    }
    const current = records.get(currentPath);
    if (!current) {
      continue;
    }
    if (line.startsWith("FNF:")) {
      current.functionsFound = Number(line.slice(4));
      continue;
    }
    if (line.startsWith("FNH:")) {
      current.functionsHit = Number(line.slice(4));
      continue;
    }
    if (line.startsWith("LF:")) {
      current.linesFound = Number(line.slice(3));
      continue;
    }
    if (line.startsWith("LH:")) {
      current.linesHit = Number(line.slice(3));
    }
  }

  return records;
}

if (!existsSync(coverageFile)) {
  throw new Error(`Missing coverage report: ${coverageFile}`);
}

const records = parseLcov(readFileSync(coverageFile, "utf8"));
const missingOrPartial: string[] = [];

for (const file of collectSourceFiles(srcRoot)) {
  const record = records.get(file);
  if (!record) {
    missingOrPartial.push(`${file}: missing from lcov`);
    continue;
  }

  const functionPct =
    record.functionsFound === 0
      ? 100
      : (record.functionsHit / record.functionsFound) * 100;
  const linePct =
    record.linesFound === 0 ? 100 : (record.linesHit / record.linesFound) * 100;

  if (functionPct < minimumFunctions || linePct < minimumLines) {
    missingOrPartial.push(
      `${file}: functions ${functionPct.toFixed(2)}%, lines ${linePct.toFixed(2)}%`,
    );
  }
}

if (missingOrPartial.length > 0) {
  throw new Error(
    [
      `Coverage check failed. Required functions=${minimumFunctions}%, lines=${minimumLines}%`,
      ...missingOrPartial,
    ].join("\n"),
  );
}

console.log("Coverage check passed.");
