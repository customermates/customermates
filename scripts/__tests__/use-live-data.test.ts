import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const script = join(root, "scripts/use-live-data.sh");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { force: true, recursive: true });
});

function executable(path: string, contents: string) {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}

function runLiveData({
  arguments: arguments_ = [],
  destinationMajor = "17",
  destinationUrl = "postgresql://postgres:postgres@127.0.0.1:5432/destination",
  dumpMajor = "17",
  libpqEnvironment = {},
  productionMajor = "17",
  restoreMajor = "17",
  withBrew = true,
}: {
  arguments?: string[];
  destinationMajor?: string;
  destinationUrl?: string;
  dumpMajor?: string;
  libpqEnvironment?: Record<string, string>;
  productionMajor?: string;
  restoreMajor?: string;
  withBrew?: boolean;
} = {}) {
  const directory = mkdtempSync(
    join(tmpdir(), "customermates-live-data-test-"),
  );
  temporaryDirectories.push(directory);
  const bin = join(directory, "bin");
  const log = join(directory, "commands.log");
  mkdirSync(bin);
  writeFileSync(log, "");

  executable(
    join(bin, "psql"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'psql-version-query\n' >> "$MOCK_COMMAND_LOG"
case "$1" in
  *production*) printf '%s\n' "$MOCK_PRODUCTION_MAJOR"'0011' ;;
  *destination*) printf '%s\n' "$MOCK_DESTINATION_MAJOR"'0011' ;;
  *) exit 91 ;;
esac
`,
  );
  executable(
    join(bin, "pg_dump"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  printf 'pg_dump-version\n' >> "$MOCK_COMMAND_LOG"
  printf 'pg_dump (PostgreSQL) %s.4\n' "$MOCK_DUMP_MAJOR"
  exit 0
fi
printf 'pg_dump-export\n' >> "$MOCK_COMMAND_LOG"
exit 86
`,
  );
  executable(
    join(bin, "pg_restore"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  printf 'pg_restore-version\n' >> "$MOCK_COMMAND_LOG"
  printf 'pg_restore (PostgreSQL) %s.4\n' "$MOCK_RESTORE_MAJOR"
  exit 0
fi
printf 'pg_restore-read\n' >> "$MOCK_COMMAND_LOG"
exit 87
`,
  );
  for (const command of ["createdb", "dropdb"]) {
    executable(
      join(bin, command),
      `#!/usr/bin/env bash
printf '${command}\n' >> "$MOCK_COMMAND_LOG"
exit 88
`,
    );
  }
  if (withBrew) {
    executable(
      join(bin, "brew"),
      `#!/usr/bin/env bash
if [[ "$1" == "--prefix" && "\${2:-}" == "postgresql@17" ]]; then
  printf '/opt/homebrew/opt/postgresql@17\n'
  exit 0
fi
exit 1
`,
    );
  }

  const result = spawnSync("bash", [script, ...arguments_], {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: destinationUrl,
      DIRECT_URL: "",
      MOCK_COMMAND_LOG: log,
      MOCK_DESTINATION_MAJOR: destinationMajor,
      MOCK_DUMP_MAJOR: dumpMajor,
      MOCK_PRODUCTION_MAJOR: productionMajor,
      MOCK_RESTORE_MAJOR: restoreMajor,
      PATH: `${bin}:/usr/bin:/bin`,
      PGDATABASE: "",
      PGHOST: "",
      PGHOSTADDR: "",
      PGPORT: "",
      PGSERVICE: "",
      PGSERVICEFILE: "",
      ...libpqEnvironment,
    },
    input:
      "\npostgresql://reader:test@production.example.com:5432/production\n",
  });

  return {
    ...result,
    commands: readFileSync(log, "utf8").trim().split("\n").filter(Boolean),
  };
}

describe("live-data PostgreSQL preflight", () => {
  it("rejects old dump and restore clients before exporting or changing local data", () => {
    const result = runLiveData({ dumpMajor: "15", restoreMajor: "15" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Production is PostgreSQL 17, but pg_dump is 15 and pg_restore is 15",
    );
    expect(result.stderr).toContain(
      'PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" yarn db:use-live-data',
    );
    expect(result.commands).toEqual([
      "psql-version-query",
      "psql-version-query",
      "pg_dump-version",
      "pg_restore-version",
    ]);
    expect(result.commands).not.toContain("pg_dump-export");
    expect(result.commands).not.toContain("dropdb");
  });

  it("preserves the migration option in the exact client-tool retry command", () => {
    const result = runLiveData({
      arguments: ["--apply-migrations"],
      dumpMajor: "15",
      restoreMajor: "15",
    });

    expect(result.stderr).toContain(
      'PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" yarn db:use-live-data --apply-migrations',
    );
  });

  it("does not print a Homebrew path on systems without Homebrew", () => {
    const result = runLiveData({
      dumpMajor: "15",
      restoreMajor: "15",
      withBrew: false,
    });

    expect(result.stderr).not.toContain("/opt/homebrew");
  });

  it("rejects a destination on another major before export or destruction", () => {
    const result = runLiveData({ destinationMajor: "16" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Production is 17 but the local destination is 16",
    );
    expect(result.stderr).toContain("yarn db:provision --recreate");
    expect(result.commands).not.toContain("pg_dump-export");
    expect(result.commands).not.toContain("dropdb");
  });

  it("rejects libpq query parameters that could redirect a loopback destination", () => {
    const result = runLiveData({
      destinationUrl:
        "postgresql://postgres:postgres@127.0.0.1:5432/destination?host=remote.example.com",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("connection options can override its host");
    expect(result.commands).toHaveLength(0);
  });

  it("rejects ambient libpq routing options that could redirect a loopback destination", () => {
    const result = runLiveData({
      libpqEnvironment: { PGHOSTADDR: "203.0.113.10" },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "PGHOSTADDR is set because libpq environment options can redirect the connection",
    );
    expect(result.commands).toHaveLength(0);
  });

  it("fails closed when Production drifts from the recorded major", () => {
    const result = runLiveData({
      destinationMajor: "18",
      dumpMajor: "18",
      productionMajor: "18",
      restoreMajor: "18",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("expected PostgreSQL 17 but found 18");
    expect(result.commands).not.toContain("pg_dump-export");
  });

  it("reaches pg_dump only after both server and both client version checks pass", () => {
    const result = runLiveData();

    expect(result.status).toBe(86);
    expect(result.stdout).toContain(
      "Preflight: Production and destination are PostgreSQL 17; pg_dump 17 and pg_restore 17 are compatible.",
    );
    expect(result.commands).toEqual([
      "psql-version-query",
      "psql-version-query",
      "pg_dump-version",
      "pg_restore-version",
      "pg_dump-export",
    ]);
  });
});
