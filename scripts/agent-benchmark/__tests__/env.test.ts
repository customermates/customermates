import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

import { requireLocalBenchmarkEnvironment } from "../env";

const base = {
  RUN_AGENT_BENCHMARK: "true",
  BASE_URL: "http://localhost:4107",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:20677/customermates",
  AI_GATEWAY_API_KEY: "key",
  WORKFLOW_LOCAL_BASE_URL: "http://localhost:4107",
  WORKFLOW_LOCAL_DATA_DIR: resolve(".next/workflow-data"),
  WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "false",
};

describe("benchmark environment", () => {
  it("accepts a loopback app, database, key and workflow base url", () => {
    expect(requireLocalBenchmarkEnvironment(base).appUrl).toBe("http://localhost:4107");
  });

  it("refuses to start without the workflow base url, which otherwise stalls a campaign", () => {
    expect(() => requireLocalBenchmarkEnvironment({ ...base, WORKFLOW_LOCAL_BASE_URL: undefined })).toThrow(
      /WORKFLOW_LOCAL_BASE_URL=http:\/\/localhost:4107/,
    );
  });

  it("refuses a workflow base url that points somewhere else", () => {
    expect(() => requireLocalBenchmarkEnvironment({ ...base, WORKFLOW_LOCAL_BASE_URL: "http://localhost:4002" })).toThrow(
      /same origin as BASE_URL/,
    );
  });

  it("refuses a missing or relative workflow data directory", () => {
    expect(() =>
      requireLocalBenchmarkEnvironment({
        ...base,
        WORKFLOW_LOCAL_DATA_DIR: undefined,
      }),
    ).toThrow(/absolute path shared/);
    expect(() =>
      requireLocalBenchmarkEnvironment({
        ...base,
        WORKFLOW_LOCAL_DATA_DIR: ".next/workflow-data",
      }),
    ).toThrow(/absolute path shared/);
  });

  it("refuses to let the secondary CLI worker recover server runs", () => {
    expect(() =>
      requireLocalBenchmarkEnvironment({
        ...base,
        WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "true",
      }),
    ).toThrow(/cannot recover the server's active runs/);
  });

  it("still refuses a deployment environment and a remote database", () => {
    expect(() => requireLocalBenchmarkEnvironment({ ...base, VERCEL: "1" })).toThrow(/deployment environment/);
    expect(() =>
      requireLocalBenchmarkEnvironment({ ...base, DATABASE_URL: "postgresql://user:pw@db.example.com:5432/app" }),
    ).toThrow(/loopback host/);
  });
});
