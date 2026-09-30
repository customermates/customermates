import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { POST as createContact } from "@/app/api/v1/contacts/route";
import { GET as readDeal, PUT as updateDeal, DELETE as deleteDeal } from "@/app/api/v1/deals/[id]/route";
import { POST as searchService } from "@/app/api/v1/services/search/route";
import {
  POST as createManyTasks,
  PUT as updateManyTasks,
  DELETE as deleteManyTasks,
} from "@/app/api/v1/tasks/many/route";
import { GET as readOrganizationConfiguration } from "@/app/api/v1/organizations/configuration/route";

const kinds = ["contacts", "organizations", "deals", "services", "tasks"] as const;
const suffixes = ["route.ts", "[id]/route.ts", "many/route.ts", "search/route.ts", "configuration/route.ts"];

describe("retired entity-specific CRM REST contract", () => {
  it.each([
    createContact,
    readDeal,
    updateDeal,
    deleteDeal,
    searchService,
    createManyTasks,
    updateManyTasks,
    deleteManyTasks,
    readOrganizationConfiguration,
  ])("returns an actionable 410 without reading a request or touching the database", async (handler) => {
    const response = handler();
    expect(response.status).toBe(410);
    expect(response.headers.get("Link")).toContain("/docs/openapi");
    await expect(response.json()).resolves.toMatchObject({
      code: "RECORD_API_V1_RETIRED",
      contractVersion: 2,
      replacements: {
        discover: "/api/v2/model/discover",
        mutate: "/api/v2/records/mutate",
      },
    });
  });

  it("removes the legacy interactor path from every retired route", () => {
    for (const kind of kinds) {
      for (const suffix of suffixes) {
        const source = readFileSync(join(process.cwd(), "app", "api", "v1", kind, suffix), "utf8");
        expect(source, `${kind}/${suffix}`).toContain("retiredRecordApiResponse");
        expect(source, `${kind}/${suffix}`).not.toContain("@/core/di");
        expect(source, `${kind}/${suffix}`).not.toContain("request.json");
      }
    }
  });
});
