import { describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordAccessMap } from "@/features/records/record-query.schema";
import { RecordSuggestionSignals } from "../record-suggestion-signals";

const PROJECTS = "70000000-0000-4000-8000-000000000001";
const SECRET = "70000000-0000-4000-8000-000000000002";
const POSITIONS = "70000000-0000-4000-8000-000000000003";
const ARCHIVE = "70000000-0000-4000-8000-000000000004";
const CLIENTS = "70000000-0000-4000-8000-000000000005";

function list(id: string, label: string, state: { embedded?: boolean; archived?: boolean } = {}) {
  return {
    id,
    label,
    pluralLabel: label,
    icon: "list",
    description: "",
    primaryFieldId: null,
    parentRelationshipId: null,
    archived: state.archived ?? false,
    embedded: state.embedded ?? false,
    navigationVisible: !state.embedded,
    position: 0,
  };
}

function signals(model: RecordModel, totals: Record<string, number>, access: RecordAccessMap) {
  const user = createMockUserWithPermissions([]);
  const query = vi
    .fn()
    .mockImplementation((spec: { typeId: string }) => Promise.resolve({ total: totals[spec.typeId] ?? 0 }));
  const records = { getModel: vi.fn().mockResolvedValue(model), query };
  const policy = {
    load: vi.fn().mockResolvedValue({
      actor: { id: user.id },
      access: () => access,
      memberScope: { userId: user.id, access: "own" },
    }),
  };
  const read = () => runWithTenant(user, () => new RecordSuggestionSignals(records as never, policy as never).read());
  return { query, read, user };
}

const model = (types: RecordModel["types"]): RecordModel => ({
  revision: 4,
  types,
  fields: [],
  relationships: [],
  accessPresets: [],
  capabilities: [],
});

describe("record suggestion signals", () => {
  it("reports records from any readable list and stops at the first one that has some", async () => {
    const userId = "user";
    const access: RecordAccessMap = new Map([
      [SECRET, { userId, access: "none" as const }],
      [PROJECTS, { userId, access: "own" as const }],
      [CLIENTS, { userId, access: "all" as const }],
      [POSITIONS, { userId, access: "all" as const }],
      [ARCHIVE, { userId, access: "all" as const }],
    ]);
    const { query, read } = signals(
      model([
        list(SECRET, "Secrets"),
        list(POSITIONS, "Positions", { embedded: true }),
        list(ARCHIVE, "Archive", { archived: true }),
        list(PROJECTS, "Projects"),
        list(CLIENTS, "Clients"),
      ]),
      { [SECRET]: 9, [POSITIONS]: 9, [ARCHIVE]: 9, [PROJECTS]: 2, [CLIENTS]: 5 },
      access,
    );

    expect(await read()).toEqual({ records: true });
    expect(query.mock.calls.map(([spec]) => spec.typeId)).toEqual([PROJECTS]);
    expect(query.mock.calls[0]?.[2].get(PROJECTS)?.access).toBe("own");
  });

  it("reports no records for a workspace without lists or with only empty lists", async () => {
    const empty = signals(model([]), {}, new Map());
    expect(await empty.read()).toEqual({ records: false });
    expect(empty.query).not.toHaveBeenCalled();

    const quiet = signals(
      model([list(PROJECTS, "Projects")]),
      {},
      new Map([[PROJECTS, { userId: "user", access: "all" as const }]]),
    );
    expect(await quiet.read()).toEqual({ records: false });
    expect(quiet.query).toHaveBeenCalledTimes(1);
  });
});
