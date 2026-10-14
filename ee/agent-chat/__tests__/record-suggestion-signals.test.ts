import { describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import type { RecordAccessMap } from "@/features/records/record-query.schema";
import { RecordSuggestionSignals } from "../record-suggestion-signals";

describe("record suggestion signals", () => {
  it("uses stable starter IDs and the caller's generic record access", async () => {
    const user = createMockUserWithPermissions([]);
    const model = createCrmPreset(user.companyId);
    const contactId = presetId(user.companyId, "contact");
    const dealId = presetId(user.companyId, "deal");
    const contactType = model.types.find((type) => type.id === contactId);
    if (!contactType) throw new Error("The starter contact type is missing");
    contactType.label = "People";
    const access: RecordAccessMap = new Map(
      model.types.map((type) => [type.id, { userId: user.id, access: "none" as const }]),
    );
    access.set(contactId, { userId: user.id, access: "all" });
    access.set(dealId, { userId: user.id, access: "own" });
    const query = vi.fn().mockImplementation((spec: { typeId: string }) =>
      Promise.resolve({
        total: spec.typeId === contactId || spec.typeId === dealId ? 1 : 0,
      }),
    );
    const records = { getModel: vi.fn().mockResolvedValue(model), query };
    const policy = {
      load: vi.fn().mockResolvedValue({
        actor: { id: user.id },
        access: () => access,
        memberScope: { userId: user.id, access: "own" },
      }),
    };

    const result = await runWithTenant(user, () =>
      new RecordSuggestionSignals(records as never, policy as never).read(),
    );

    expect(result).toEqual({ contacts: true, deals: true });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.map(([spec]) => spec.typeId).sort()).toEqual([contactId, dealId].sort());
    expect(query.mock.calls[0]?.[2].get(dealId)?.access).toBe("own");
  });
});
