import { isObservable, observable } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getRecordChoicesAction = vi.fn();

vi.mock("@/app/[locale]/(protected)/records/actions", () => ({
  getRecordChoicesAction: (input: unknown) => getRecordChoicesAction(input),
}));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));

const { RecordChoicesStore, recordChoicesKey } = await import("../record-choices.store");

describe("RecordChoicesStore", () => {
  beforeEach(() => getRecordChoicesAction.mockReset().mockResolvedValue({ ok: true, data: { records: [] } }));

  it("sends a plain object to the server action when the linked record ref is observable", async () => {
    const ref = observable({ typeId: "type-1", recordId: "record-1" });
    const input = {
      typeId: "type-2",
      page: 1,
      pageSize: 100,
      linkedTo: { ref, relationId: "relation-1", direction: "outgoing" as const },
    };
    const store = new RecordChoicesStore();

    await store.load(recordChoicesKey(input, 0), input);

    const sent = getRecordChoicesAction.mock.calls[0][0];
    expect(isObservable(sent.linkedTo.ref)).toBe(false);
    expect(sent.linkedTo.ref).toEqual({ typeId: "type-1", recordId: "record-1" });
  });
});
