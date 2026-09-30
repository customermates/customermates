import "dotenv/config";

import { readFile } from "node:fs/promises";

import { exportErrorSourceMaps, loadErrorSourceMaps, resolveErrorFrames } from "./lib/error-source-maps";

const [command, reportFile] = process.argv.slice(2);
if (command === "export") {
  if (process.env.NEXT_PUBLIC_ERROR_REPORTING_PROVIDER === "vercel") {
    const exported = await exportErrorSourceMaps(process.cwd());
    process.stdout.write(`Exported ${exported.maps} private source maps for build ${exported.buildId}\n`);
  }
} else if (command === "resolve" && reportFile) {
  const report = JSON.parse(await readFile(reportFile, "utf8")) as {
    buildId: string;
    frames: Parameters<typeof resolveErrorFrames>[2];
  };
  const archive = await loadErrorSourceMaps(process.cwd(), report.buildId, report.frames);
  process.stdout.write(`${JSON.stringify(resolveErrorFrames(archive, report.buildId, report.frames), null, 2)}\n`);
} else throw new Error("Usage: error-source-maps.ts export | resolve <structured-error.json>");
