import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertLocalDatabaseEnvironment,
  databaseUrlFromEnvironment,
  isStrictlyLocalDatabaseEnvironment,
  LIBPQ_ROUTING_VARIABLES,
  LOCAL_OPERATOR_SEED_OPT_IN,
  shouldIncludeLocalOperatorAccess,  shouldIncludeOperatorSeedAccess,
} from "../local-database-safety";

const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/customermates";

describe("local database safety", () => {
  it.each([
    "postgresql://postgres:postgres@localhost:5432/customermates",
    "postgres://postgres:postgres@127.0.0.1:5432/customermates",
    "postgresql://postgres:postgres@[::1]:5432/customermates",
  ])("accepts an exact loopback PostgreSQL URL", (databaseUrl) => {
    expect(assertLocalDatabaseEnvironment({ DATABASE_URL: databaseUrl })).toBe(databaseUrl);
  });

  it.each([
    "postgresql://postgres:postgres@db.example.com:5432/customermates",
    "postgresql://postgres:postgres@ep-example-pooler.eu-central-1.aws.neon.tech/customermates",
    "postgresql://127.0.0.1@db.example.com/customermates",
    "mysql://root:root@127.0.0.1:3306/customermates",
  ])("rejects remote, pooled, spoofed, and non-PostgreSQL URLs", (databaseUrl) => {
    expect(() => assertLocalDatabaseEnvironment({ DATABASE_URL: databaseUrl })).toThrow();
  });

  it.each([
    `${LOCAL_DATABASE_URL}?host=db.example.com`,
    `${LOCAL_DATABASE_URL}?sslmode=require`,
    `${LOCAL_DATABASE_URL}#host=db.example.com`,
  ])("rejects URL options and fragments", (databaseUrl) => {
    expect(() => assertLocalDatabaseEnvironment({ DATABASE_URL: databaseUrl })).toThrow(
      /query parameters or a fragment/u,
    );
  });

  it("validates DATABASE_URL even when a local DIRECT_URL would be selected", () => {
    expect(() =>
      assertLocalDatabaseEnvironment({
        DATABASE_URL: "postgresql://postgres:postgres@db.example.com/customermates",
        DIRECT_URL: LOCAL_DATABASE_URL,
      }),
    ).toThrow(/DATABASE_URL must use an exact loopback host/u);
  });

  it("selects a remote preview connection without ever classifying it as local operator access", () => {
    const environment = {
      DATABASE_URL: "postgresql://preview:preview@ep-example-pooler.eu-central-1.aws.neon.tech/customermates",
      DIRECT_URL: "postgresql://preview:preview@ep-example.eu-central-1.aws.neon.tech/customermates",
    };

    expect(databaseUrlFromEnvironment(environment)).toBe(environment.DIRECT_URL);
    expect(isStrictlyLocalDatabaseEnvironment(environment)).toBe(false);
  });

  it.each([
    { DATABASE_URL: "postgresql://127.0.0.1@db.example.com/customermates" },
    { DATABASE_URL: `${LOCAL_DATABASE_URL}?host=db.example.com` },
    { DATABASE_URL: `${LOCAL_DATABASE_URL}#redirect` },
    { DATABASE_URL: LOCAL_DATABASE_URL, PGHOST: "db.example.com" },
    { DATABASE_URL: LOCAL_DATABASE_URL, PGSERVICE: "production" },
  ])("never enables local operator access for a redirectable environment", (environment) => {
    expect(isStrictlyLocalDatabaseEnvironment(environment)).toBe(false);
    expect(shouldIncludeLocalOperatorAccess({ ...environment, [LOCAL_OPERATOR_SEED_OPT_IN]: "true" })).toBe(false);
  });

  it("requires the exact explicit opt-in in addition to a strict local database", () => {
    expect(shouldIncludeLocalOperatorAccess({ DATABASE_URL: LOCAL_DATABASE_URL })).toBe(false);
    expect(
      shouldIncludeLocalOperatorAccess({
        DATABASE_URL: LOCAL_DATABASE_URL,
        [LOCAL_OPERATOR_SEED_OPT_IN]: "true",
      }),
    ).toBe(true);
    expect(
      shouldIncludeLocalOperatorAccess({
        DATABASE_URL: LOCAL_DATABASE_URL,
        [LOCAL_OPERATOR_SEED_OPT_IN]: "TRUE",
      }),
    ).toBe(false);
  });

  it.each([
    { NODE_ENV: "production" },
    { VERCEL: "1" },
    { VERCEL_ENV: "preview" },
    { CI: "true" },
  ])("denies local operator access in production, Vercel, and CI contexts", (guard) => {
    expect(
      shouldIncludeLocalOperatorAccess({
        DATABASE_URL: LOCAL_DATABASE_URL,
        [LOCAL_OPERATOR_SEED_OPT_IN]: "true",
        ...guard,
      }),
    ).toBe(false);
  });

  it.each(LIBPQ_ROUTING_VARIABLES)("rejects ambient %s routing", (name) => {
    expect(() => assertLocalDatabaseEnvironment({ DATABASE_URL: LOCAL_DATABASE_URL, [name]: "redirect" })).toThrow(
      `${name} must be unset`,
    );
  });

  it("places the reset safety preflight before every destructive Prisma command", () => {
    const resetScript = readFileSync(new URL("../../ee/scripts/reset-db.sh", import.meta.url), "utf8");
    const preflight = resetScript.indexOf("tsx scripts/assert-local-database-url.ts");
    const dbPush = resetScript.indexOf("prisma db push");
    const migrateReset = resetScript.indexOf("prisma migrate reset");

    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(dbPush);
    expect(preflight).toBeLessThan(migrateReset);

    const seedCommands = resetScript
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("npx prisma db seed"));
    expect(seedCommands).toHaveLength(2);
    expect(seedCommands).toEqual([
      `${LOCAL_OPERATOR_SEED_OPT_IN}=true npx prisma db seed`,
      `${LOCAL_OPERATOR_SEED_OPT_IN}=true npx prisma db seed`,
    ]);
  });

describe("operator seed access", () => {
  it("never grants operator access on any Vercel environment, preview included", () => {
    expect(shouldIncludeOperatorSeedAccess({ VERCEL: "1", VERCEL_ENV: "preview" })).toBe(false);
    expect(shouldIncludeOperatorSeedAccess({ VERCEL: "1", VERCEL_ENV: "production" })).toBe(false);
    expect(shouldIncludeOperatorSeedAccess({ VERCEL: "1", VERCEL_ENV: "development" })).toBe(false);
    expect(shouldIncludeOperatorSeedAccess({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
    expect(shouldIncludeOperatorSeedAccess({})).toBe(false);
  });

  it("refuses the opt-in unless the database is loopback-local and no build environment is present", () => {
    const optIn = { [LOCAL_OPERATOR_SEED_OPT_IN]: "true" } as const;
    const localUrl = "postgresql://postgres:postgres@127.0.0.1:31758/customermates";

    expect(shouldIncludeOperatorSeedAccess({ ...optIn, DATABASE_URL: localUrl })).toBe(true);
    expect(shouldIncludeOperatorSeedAccess({ ...optIn, DATABASE_URL: localUrl, VERCEL_ENV: "preview" })).toBe(false);
    expect(shouldIncludeOperatorSeedAccess({ ...optIn, DATABASE_URL: localUrl, VERCEL: "1" })).toBe(false);
    expect(shouldIncludeOperatorSeedAccess({ ...optIn, DATABASE_URL: localUrl, CI: "true" })).toBe(false);
    expect(
      shouldIncludeOperatorSeedAccess({ ...optIn, DATABASE_URL: "postgresql://user:pw@db.example.com:5432/app" }),
    ).toBe(false);
    expect(shouldIncludeOperatorSeedAccess({ DATABASE_URL: localUrl })).toBe(false);
  });
});
});
