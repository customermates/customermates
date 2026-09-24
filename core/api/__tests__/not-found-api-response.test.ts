import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";

type Operation = { operationId?: string; description?: string; responses?: Record<string, unknown> };

function operationsById(): Map<string, Operation> {
  const spec = generateOpenApiSpec() as { paths?: Record<string, Record<string, Operation>> };
  const operations = new Map<string, Operation>();
  for (const entry of Object.values(spec.paths ?? {})) {
    for (const operation of Object.values(entry))
      if (operation.operationId) operations.set(operation.operationId, operation);
  }
  return operations;
}

const NULL_ON_MISSING = [
  "getContactById",
  "getDealById",
  "getOrganizationById",
  "getServiceById",
  "getTaskById",
  "getWebhook",
  "getCalendarById",
  "getCalendarEventById",
];

const NOT_FOUND_ON_MISSING = [
  "updateContact",
  "deleteContact",
  "updateManyContacts",
  "deleteManyContacts",
  "createContact",
  "getContacts",
  "updateDeal",
  "deleteDeal",
  "updateOrganization",
  "deleteOrganization",
  "updateService",
  "deleteService",
  "updateTask",
  "deleteTask",
  "createWebhook",
  "deleteWebhook",
  "getMessagingThread",
  "discardDraft",
  "sendChatMessage",
  "searchSalesPeople",
];

const NEVER_NOT_FOUND = ["getContactConfiguration", "getUserProfile", "getUsers", "getConnectedAccounts"];

describe("documented 404 responses", () => {
  const operations = operationsById();

  it.each(NULL_ON_MISSING)("documents %s as answering null for a missing id, not 404", (operationId) => {
    const operation = operations.get(operationId);
    expect(operation, operationId).toBeDefined();
    expect(Object.keys(operation?.responses ?? {})).not.toContain("404");
    expect(operation?.description).toMatch(/null/);
  });

  it.each(NOT_FOUND_ON_MISSING)("documents 404 on %s, whose handler can answer not found", (operationId) => {
    expect(Object.keys(operations.get(operationId)?.responses ?? {})).toContain("404");
  });

  it.each(NEVER_NOT_FOUND)("documents no 404 on %s, which looks up no id", (operationId) => {
    const operation = operations.get(operationId);
    expect(operation, operationId).toBeDefined();
    expect(Object.keys(operation?.responses ?? {})).not.toContain("404");
  });
});
