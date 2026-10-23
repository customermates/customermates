import type { RecordModel } from "../record-model.schema";

import { describe, expect, it } from "vitest";

import { recordFilterPaths, resolveRecordPath } from "../record-relationship-path";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const type = (n: number, label: string, paths: NonNullable<RecordModel["types"][number]["relationshipPaths"]> = []) =>
  ({ id: id(n), label, archived: false, relationshipPaths: paths }) as unknown as RecordModel["types"][number];
const relation = (n: number, source: number, target: number) =>
  ({
    id: id(n),
    sourceTypeId: id(source),
    targetTypeId: id(target),
    archived: false,
  }) as RecordModel["relationships"][number];

const ticketsPath = {
  id: id(30),
  label: "Support tickets",
  archived: false,
  path: [
    { relationId: id(20), direction: "incoming" as const },
    { relationId: id(21), direction: "incoming" as const },
  ],
};
const model = {
  types: [type(1, "Organization", [ticketsPath]), type(2, "Contact"), type(3, "Ticket")],
  relationships: [relation(20, 2, 1), relation(21, 3, 2)],
};

describe("record filter paths", () => {
  it("offers a path of another list, reversed, to the list it ends at", () => {
    const [reversed] = recordFilterPaths(id(3), model);
    expect(reversed).toEqual({
      ...ticketsPath,
      label: "Organization",
      sourceTypeId: id(1),
      path: [
        { relationId: id(21), direction: "outgoing" },
        { relationId: id(20), direction: "outgoing" },
      ],
    });
    expect(resolveRecordPath(id(3), reversed.path, model)?.at(-1)?.typeId).toBe(id(1));
  });

  it("keeps the list's own paths and skips archived paths, archived owners and other end lists", () => {
    expect(recordFilterPaths(id(1), model)).toEqual([ticketsPath]);
    expect(recordFilterPaths(id(2), model)).toEqual([]);
    const archived = {
      ...model,
      types: [type(1, "Organization", [{ ...ticketsPath, archived: true }]), ...model.types.slice(1)],
    };
    expect(recordFilterPaths(id(3), archived)).toEqual([]);
  });
});
