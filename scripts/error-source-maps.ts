import "dotenv/config";

import { readFile } from "node:fs/promises";

import { exportErrorSourceMaps, resolveErrorReport, type ErrorSourceMapReport } from "./lib/error-source-maps";
import { usesVercelErrorReporting } from "../core/errors/reporting-provider";

const [command, reportFile] = process.argv.slice(2);
if (command === "export") {
  if (usesVercelErrorReporting()) {
    const exported = await exportErrorSourceMaps(process.cwd());
    process.stdout.write(`Exported ${exported.maps} private source maps for build ${exported.buildId}\n`);
  }
} else if (command === "resolve" && reportFile) {
  const report = JSON.parse(await readFile(reportFile, "utf8")) as ErrorSourceMapReport;
  process.stdout.write(`${JSON.stringify(await resolveErrorReport(process.cwd(), report), null, 2)}\n`);
} else throw new Error("Usage: error-source-maps.ts export | resolve <structured-error.json>");
