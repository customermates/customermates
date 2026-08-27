import { afterEach, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "../database-test";

const originalRunDatabaseTests = process.env.RUN_DATABASE_TESTS;
const originalDatabaseUrl = process.env.DATABASE_URL;

describe.sequential("database test guard", () => {
  afterEach(() => {
    restoreEnvironmentVariable("RUN_DATABASE_TESTS", originalRunDatabaseTests);
    restoreEnvironmentVariable("DATABASE_URL", originalDatabaseUrl);
  });

  it("keeps database suites disabled unless explicitly requested", () => {
    delete process.env.RUN_DATABASE_TESTS;
    process.env.DATABASE_URL =
      "postgresql://user:password@remote.example/customermates";

    expect(getLocalDatabaseTestUrl()).toBeNull();
  });

  it("uses the existing loopback PostgreSQL URL when enabled", () => {
    process.env.RUN_DATABASE_TESTS = "true";
    process.env.DATABASE_URL =
      "postgresql://user:password@localhost:5432/customermates";

    expect(getLocalDatabaseTestUrl()).toBe(process.env.DATABASE_URL);
  });

  it("rejects missing and non-local database targets", () => {
    process.env.RUN_DATABASE_TESTS = "true";
    delete process.env.DATABASE_URL;
    expect(() => getLocalDatabaseTestUrl()).toThrow("DATABASE_URL is required");

    process.env.DATABASE_URL =
      "postgresql://user:password@remote.example/customermates";
    expect(() => getLocalDatabaseTestUrl()).toThrow(
      "must point to a local PostgreSQL instance",
    );

    process.env.DATABASE_URL = "mysql://user:password@localhost/customermates";
    expect(() => getLocalDatabaseTestUrl()).toThrow(
      "must point to a local PostgreSQL instance",
    );
  });

  it("rejects a connection-string host override", () => {
    process.env.RUN_DATABASE_TESTS = "true";
    process.env.DATABASE_URL =
      "postgresql://user:password@localhost/customermates?host=remote.example";

    expect(() => getLocalDatabaseTestUrl()).toThrow(
      "must point to a local PostgreSQL instance",
    );
  });
});

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
