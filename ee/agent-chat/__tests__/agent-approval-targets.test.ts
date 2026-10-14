import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
  view: vi.fn(),
  trash: vi.fn(),
  model: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getManageDataViewsInteractor: () => ({ invoke: reads.view }),
  getQueryTrashInteractor: () => ({ invoke: reads.trash }),
  getGetRecordModelInteractor: () => ({ invoke: reads.model }),
  getGetRecordInteractor: () => ({ invoke: reads.record }),
}));

import { resolvedAgentApprovalActivity } from "../agent-approval-targets";
import { approvalTargetRefusal } from "../agent-approval-guard";

const itemId = "00000000-0000-4000-8000-000000000001";
const typeId = "00000000-0000-4000-8000-000000000002";
const recordId = "00000000-0000-4000-8000-000000000003";
const primaryFieldId = "00000000-0000-4000-8000-000000000004";

describe("resolved agent approval targets", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses the current saved-view name and refuses a different requested name", async () => {
    reads.view.mockResolvedValue({
      ok: true,
      data: { items: [{ name: "Q1 pipeline (old)" }] },
    });
    const input = {
      action: "delete",
      surfaceKey: "dashboard",
      viewKey: itemId,
      name: "PB big proposals",
    };
    const wrong = await resolvedAgentApprovalActivity("manage_data_views", input);
    expect(wrong.activity.context).toBeUndefined();
    const exact = await resolvedAgentApprovalActivity("manage_data_views", {
      ...input,
      name: "Q1 pipeline (old)",
    });
    expect(exact.activity.context?.labels).toEqual(["Q1 pipeline (old)"]);
    expect(exact.names).toEqual(["Q1 pipeline (old)"]);
    expect(reads.view).toHaveBeenCalledWith({
      action: "read",
      surfaceKey: "dashboard",
      viewKey: itemId,
    });
  });

  it.each(["Pipeline: Q4", "Umsatz: Oktober", "Q1 pipeline (old)"])(
    "accepts the full saved-view name %s while keeping the card label short",
    async (name) => {
      reads.view.mockResolvedValue({ ok: true, data: { items: [{ name }] } });
      const request = {
        toolName: "manage_data_views",
        input: {
          action: "delete",
          surfaceKey: "dashboard",
          viewKey: itemId,
          name,
        },
      };
      const resolved = await resolvedAgentApprovalActivity(request.toolName, request.input);
      expect(resolved.names).toEqual([name]);
      expect(
        approvalTargetRefusal(request, resolved.activity, resolved.names, new Set(), `Delete "${name}".`),
      ).toBeNull();
      expect(
        approvalTargetRefusal(request, resolved.activity, resolved.names, new Set(), 'Delete "Wrong view".'),
      ).toContain('"Wrong view" was not found');
    },
  );

  it("refuses a saved view that is no longer present", async () => {
    reads.view.mockResolvedValue({ ok: true, data: { items: [] } });
    const request = {
      toolName: "manage_data_views",
      input: {
        action: "delete",
        surfaceKey: "dashboard",
        viewKey: itemId,
        name: "Pipeline: Q4",
      },
    };
    const resolved = await resolvedAgentApprovalActivity(request.toolName, request.input);
    expect(
      approvalTargetRefusal(request, resolved.activity, resolved.names, new Set(), 'Delete "Pipeline: Q4".'),
    ).toContain("could not be found");
  });

  it("names the selected Trash item and refuses a missing item", async () => {
    reads.trash.mockResolvedValueOnce({
      ok: true,
      data: {
        total: 1,
        items: [{ id: itemId, kind: "view", label: "Q1 pipeline (old)" }],
      },
    });
    const selected = await resolvedAgentApprovalActivity("manage_trash", {
      action: "delete_permanently",
      itemIds: [itemId],
    });
    expect(selected.activity.context?.labels).toEqual(["view: Q1 pipeline (old)"]);
    expect(selected.names).toEqual(["Q1 pipeline (old)"]);
    expect(reads.trash).toHaveBeenCalledWith({
      itemIds: [itemId],
      page: 1,
      pageSize: 100,
    });
    reads.trash.mockResolvedValueOnce({
      ok: true,
      data: { total: 0, items: [] },
    });
    const missing = await resolvedAgentApprovalActivity("manage_trash", {
      action: "delete_permanently",
      itemIds: [itemId],
    });
    expect(missing.activity.context).toBeUndefined();
    expect(missing.activity.permanent).toBe(true);
    reads.trash.mockResolvedValueOnce({
      ok: true,
      data: {
        total: 1,
        items: [{ id: recordId, kind: "view", label: "Different view" }],
      },
    });
    const wrongItem = await resolvedAgentApprovalActivity("manage_trash", {
      action: "delete_permanently",
      itemIds: [itemId],
    });
    expect(wrongItem.activity.context).toBeUndefined();
  });

  it("names the record and list resolved from the exact record reference", async () => {
    reads.model.mockResolvedValue({
      ok: true,
      data: { types: [{ id: typeId, label: "Deal", primaryFieldId }] },
    });
    reads.record.mockResolvedValue({
      ok: true,
      data: {
        fields: [
          {
            fieldId: primaryFieldId,
            result: {
              state: "value",
              value: { kind: "text", value: "Lowell renewal" },
            },
          },
        ],
      },
    });
    const activity = await resolvedAgentApprovalActivity("mutate_crm_record", {
      mutation: { action: "delete", ref: { typeId, recordId } },
    });
    expect(activity.activity.context?.labels).toEqual(["Deal: Lowell renewal"]);
    expect(activity.names).toEqual(["Lowell renewal"]);
  });

  it.each(["Long record " + "L".repeat(90), "Langer Datensatz " + "M".repeat(90), "Lowell renewal"])(
    "accepts the full record title for %s while keeping the card label short",
    async (name) => {
      reads.model.mockResolvedValue({
        ok: true,
        data: { types: [{ id: typeId, label: "Deal", primaryFieldId }] },
      });
      reads.record.mockResolvedValue({
        ok: true,
        data: {
          fields: [
            {
              fieldId: primaryFieldId,
              result: { state: "value", value: { kind: "text", value: name } },
            },
          ],
        },
      });
      const request = {
        toolName: "mutate_crm_record",
        input: { mutation: { action: "delete", ref: { typeId, recordId } } },
      };
      const resolved = await resolvedAgentApprovalActivity(request.toolName, request.input);
      expect(resolved.names).toEqual([name]);
      expect(resolved.activity.context?.labels[0].length).toBeLessThanOrEqual(80);
      expect(
        approvalTargetRefusal(request, resolved.activity, resolved.names, new Set(), `Move "${name}" to Trash.`),
      ).toBeNull();
      expect(
        approvalTargetRefusal(request, resolved.activity, resolved.names, new Set(), 'Move "Wrong record" to Trash.'),
      ).toContain('"Wrong record" was not found');
    },
  );

  it("refuses an approval when the referenced record cannot be read", async () => {
    reads.model.mockResolvedValue({
      ok: true,
      data: { types: [{ id: typeId, label: "Deal", primaryFieldId }] },
    });
    reads.record.mockResolvedValue({ ok: false });
    const activity = await resolvedAgentApprovalActivity("mutate_crm_record", {
      mutation: { action: "delete", ref: { typeId, recordId } },
    });
    expect(activity.activity.context).toBeUndefined();
    expect(activity.names).toEqual([]);
  });
});
