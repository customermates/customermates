import "dotenv/config";

import { assertLocalDatabaseEnvironment } from "./local-database-safety";

try {
  assertLocalDatabaseEnvironment(process.env);
  process.stdout.write("Local-only database safety preflight passed.\n");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown database safety error.";
  process.stderr.write(`Database safety preflight failed: ${message}\n`);
  process.exitCode = 1;
}
