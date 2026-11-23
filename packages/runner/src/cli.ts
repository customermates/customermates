#!/usr/bin/env node
import { hostname } from "node:os";

import { createApiClient } from "./api-client.js";
import { runDaemon } from "./daemon.js";
import { discoverClients } from "./discover.js";
import { createLogger } from "./logger.js";
import { HELP_TEXT, parseOptions } from "./options.js";
import { runJob } from "./run-job.js";
import { sleep } from "./sleep.js";
import { installStopSignals } from "./stop-signals.js";

const VERSION = "0.1.1";

async function main(): Promise<number> {
  const parsed = parseOptions(process.argv.slice(2), process.env);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n\n${HELP_TEXT}\n`);
    return 2;
  }
  const { options } = parsed;
  if (options.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }

  const log = createLogger([options.token]);
  const api = createApiClient({ baseUrl: options.url, token: options.token, version: VERSION });
  const signals = installStopSignals(process, (code) => process.exit(code));

  const exit = await runDaemon(
    options,
    {
      api,
      log,
      discover: () => discoverClients(process.env),
      runJob: (claimed, client, signal) =>
        runJob(claimed, client, options, { api, log, signal, forceSignal: signals.force }),
      sleep,
      hostname: hostname(),
    },
    signals.stop,
  );
  return exit === "unauthorized" ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
