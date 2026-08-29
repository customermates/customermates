import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const ENFORCED = true;

const TENANT_FK_ALLOWLIST = new Set([
  "Company",
  "AuthSession",
  "AuthAccount",
  "AuthVerification",
  "Apikey",
  "OauthApplication",
  "OauthAccessToken",
  "OauthConsent",
  "HostedAiGlobalControl",
  "OperatorAuditEvent",
]);

type PrismaModel = {
  name: string;
  line: number;
  hasCompanyId: boolean;
};

function collectModels() {
  const text = readFileSync(join(REPO_ROOT, "prisma", "schema.prisma"), "utf8");
  const models: PrismaModel[] = [];
  let current: PrismaModel | null = null;
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const header = /^model (\w+) \{/.exec(line);
    if (header) {
      current = { name: header[1], line: index + 1, hasCompanyId: false };
      models.push(current);
      continue;
    }
    if (/^\}/.test(line)) {
      current = null;
      continue;
    }
    if (current && /^\s+companyId\s/.test(line)) current.hasCompanyId = true;
  }
  return models;
}

const models = collectModels();

describe("prisma tenant foreign key convention", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "every model carries a companyId field or is an allowlisted global model",
    () => {
      const violations = models
        .filter((model) => !model.hasCompanyId && !TENANT_FK_ALLOWLIST.has(model.name))
        .map((model) => `prisma/schema.prisma:${model.line} model ${model.name} lacks companyId and is not allowlisted`);

      expect(violations, violations.join("\n")).toEqual([]);
    },
  );

  it("sees the expected schema surface", () => {
    expect(models.length).toBeGreaterThan(40);
    expect(models.some((model) => model.name === "Company")).toBe(true);
    expect(models.filter((model) => model.hasCompanyId).length).toBeGreaterThan(35);
  });

  it("keeps the allowlist free of stale or tenant-scoped entries", () => {
    const byName = new Map(models.map((model) => [model.name, model]));
    const stale = [...TENANT_FK_ALLOWLIST].filter((entry) => {
      const model = byName.get(entry);
      return !model || model.hasCompanyId;
    });

    expect(stale, stale.join("\n")).toEqual([]);
  });
});
