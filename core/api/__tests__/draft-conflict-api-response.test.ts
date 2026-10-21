import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { CustomErrorCode } from "@/core/validation/validation.types";

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

const SEND_CONFLICTS = [
  CustomErrorCode.draftChanged,
  CustomErrorCode.draftTargetMismatch,
  CustomErrorCode.draftSendInProgress,
  CustomErrorCode.draftSendOutcomeUnknown,
  CustomErrorCode.draftAlreadySent,
];

const DRAFT_CONFLICTS: [string, CustomErrorCode[]][] = [
  ["sendEmail", [...SEND_CONFLICTS, CustomErrorCode.draftRecipientsChanged]],
  ["sendChatMessage", SEND_CONFLICTS],
  ["startChat", [...SEND_CONFLICTS, CustomErrorCode.draftRecipientsChanged]],
  ["discardDraft", [CustomErrorCode.draftChanged, CustomErrorCode.draftSendInProgress]],
  ["saveDraft", [CustomErrorCode.draftSendInProgress]],
];

const SENDS = [
  ["sendEmail", "200"],
  ["sendChatMessage", "201"],
  ["startChat", "201"],
] as const;

describe("documented 409 draft conflicts", () => {
  const operations = operationsById();

  it.each(DRAFT_CONFLICTS)(
    "documents 409 on %s and names every draft conflict code it answers",
    (operationId, codes) => {
      const operation = operations.get(operationId);
      expect(Object.keys(operation?.responses ?? {})).toContain("409");
      for (const code of codes) expect(operation?.description, `${operationId} names ${code}`).toContain(code);
    },
  );

  it("documents the stale-revision discard as 409 draftChanged", () => {
    expect(operations.get("discardDraft")?.description).toContain(
      "draftRevision that no longer matches the saved draft answers 409 with customCode draftChanged",
    );
  });

  it.each(SENDS)("documents %s with its recorded status %s and 202 for an unrecorded send", (operationId, status) => {
    expect(Object.keys(operations.get(operationId)?.responses ?? {})).toEqual(expect.arrayContaining([status, "202"]));
  });
});
