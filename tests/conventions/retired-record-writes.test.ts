import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { retireLegacyRecordWrite } from "@/features/records/retire-legacy-write";
import { REPO_ROOT } from "./walk";

const actionFiles: Record<string, string[]> = {
  "app/[locale]/(protected)/contacts/actions.ts": [
    "createContactAction",
    "updateContactAction",
    "deleteContactAction",
    "createContactByNameAction",
  ],
  "app/[locale]/(protected)/organizations/actions.ts": [
    "createOrganizationAction",
    "updateOrganizationAction",
    "deleteOrganizationAction",
    "createOrganizationByNameAction",
  ],
  "app/[locale]/(protected)/deals/actions.ts": [
    "createDealAction",
    "updateDealAction",
    "deleteDealAction",
    "createDealByNameAction",
  ],
  "app/[locale]/(protected)/services/actions.ts": [
    "createServiceAction",
    "updateServiceAction",
    "deleteServiceAction",
    "createServiceByNameAction",
  ],
  "app/[locale]/(protected)/tasks/actions.ts": [
    "createTaskAction",
    "updateTaskAction",
    "deleteTaskAction",
    "createTaskByNameAction",
  ],
  "app/[locale]/(protected)/data-transfer/actions.ts": ["dryRunImportChunkAction", "commitImportChunkAction"],
  "app/actions.ts": [
    "deleteCustomColumnAction",
    "upsertCustomColumnAction",
    "updateEntityCustomFieldValueAction",
    "bulkDeleteEntitiesAction",
    "bulkUpdateCustomFieldValuesAction",
  ],
};

describe("retired legacy CRM write actions", () => {
  it("fails closed before reaching a legacy interactor", () => {
    expect(retireLegacyRecordWrite).toThrow(/retired/);
    for (const [file, names] of Object.entries(actionFiles)) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      for (const name of names) {
        const start = source.indexOf(`export async function ${name}(`);
        expect(start, `${file}: ${name} is missing`).toBeGreaterThanOrEqual(0);
        const end = source.indexOf("\n}\n", start);
        expect(end, `${file}: ${name} body is missing`).toBeGreaterThan(start);
        const body = source.slice(start, end);
        expect(body, `${file}: ${name}`).toContain("retireLegacyRecordWrite();");
        expect(body.indexOf("retireLegacyRecordWrite();"), `${file}: ${name} must fail before invoking an interactor`).toBeLessThan(
          body.indexOf("return "),
        );
      }
    }
  });
});
