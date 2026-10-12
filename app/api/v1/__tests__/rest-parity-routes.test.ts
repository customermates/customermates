import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const interactors = vi.hoisted(() => ({
  manageDataViews: vi.fn(),
  getWidgets: vi.fn(),
  deleteWidget: vi.fn(),
  updateWidgetLayouts: vi.fn(),
  getRecordModel: vi.fn(),
  discoverRecordTypes: vi.fn(),
  getTrashedRecord: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getManageDataViewsInteractor: () => ({ invoke: interactors.manageDataViews }),
  getGetWidgetsInteractor: () => ({ invoke: interactors.getWidgets }),
  getDeleteWidgetInteractor: () => ({ invoke: interactors.deleteWidget }),
  getUpdateWidgetLayoutsInteractor: () => ({ invoke: interactors.updateWidgetLayouts }),
  getGetRecordModelInteractor: () => ({ invoke: interactors.getRecordModel }),
  getDiscoverRecordTypesInteractor: () => ({ invoke: interactors.discoverRecordTypes }),
  getGetTrashedRecordInteractor: () => ({ invoke: interactors.getTrashedRecord }),
}));

import { POST as surfaces } from "../data-views/surfaces/route";
import { POST as config } from "../data-views/config/route";
import { POST as list } from "../data-views/list/route";
import { POST as read } from "../data-views/read/route";
import { POST as create } from "../data-views/create/route";
import { POST as update } from "../data-views/update/route";
import { POST as select } from "../data-views/select/route";
import { POST as reset } from "../data-views/reset/route";
import { POST as remove } from "../data-views/delete/route";
import { POST as listWidgets } from "../widgets/list/route";
import { POST as deleteWidget } from "../widgets/delete/route";
import { POST as layoutWidgets } from "../widgets/layout/route";
import { POST as readModel } from "../model/read/route";
import { POST as discoverModel } from "../model/discover/route";
import { POST as readTrashed } from "../trash/read/route";

const ID = "00000000-0000-4000-8000-000000000001";

function request(body: unknown) {
  return new NextRequest("http://localhost:4105/api/v1/test", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "test-transport-only" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("saved view REST routes", () => {
  it.each([
    ["surfaces", surfaces],
    ["config", config],
    ["list", list],
    ["read", read],
    ["create", create],
    ["update", update],
    ["select", select],
    ["reset", reset],
    ["delete", remove],
  ] as const)("calls the manage_data_views interactor with action %s and returns its result", async (action, route) => {
    interactors.manageDataViews.mockResolvedValue({ ok: true, data: { action } });

    const response = await route(request({ surfaceKey: "dashboard", viewKey: ID, action: "delete" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ action });
    expect(interactors.manageDataViews).toHaveBeenCalledExactlyOnceWith({
      surfaceKey: "dashboard",
      viewKey: ID,
      action,
    });
  });

  it("returns an authorization failure as 403 with the structured body", async () => {
    interactors.manageDataViews.mockResolvedValue({
      ok: false,
      error: createZodError("Denied", ["surfaceKey"], { error: CustomErrorCode.permissionDenied }),
    });

    const response = await list(request({ surfaceKey: "users" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        kind: "authorization",
        issues: [{ path: ["surfaceKey"], customCode: CustomErrorCode.permissionDenied }],
      },
    });
  });

  it("rejects a malformed body before any interactor runs", async () => {
    const response = await create(request("{"));

    expect(response.status).toBe(400);
    expect(interactors.manageDataViews).not.toHaveBeenCalled();
  });
});

describe("widget REST routes", () => {
  it("lists every widget across dashboard views", async () => {
    const items = [{ id: ID, viewId: null, layout: { lg: { i: ID, x: 0, y: 0, w: 6, h: 3 } } }];
    interactors.getWidgets.mockResolvedValue({ ok: true, data: { items, views: [], activeViewKey: "__all__" } });

    const response = await listWidgets(request({}));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ widgets: items });
    expect(interactors.getWidgets).toHaveBeenCalledExactlyOnceWith({ allViews: true });
  });

  it("passes delete and layout bodies through unchanged", async () => {
    interactors.deleteWidget.mockResolvedValue({ ok: true, data: { id: ID, trashBatchId: ID } });
    interactors.updateWidgetLayouts.mockResolvedValue({ ok: true, data: [] });
    const layouts = { xs: [], sm: [], md: [], lg: [{ i: ID, x: 6, y: 0, w: 6, h: 3 }] };
    const expectedVersions = { [ID]: 1 };

    expect(await (await deleteWidget(request({ id: ID }))).json()).toEqual({ id: ID, trashBatchId: ID });
    expect(await (await layoutWidgets(request({ layouts, expectedVersions }))).json()).toEqual([]);
    expect(interactors.deleteWidget).toHaveBeenCalledExactlyOnceWith({ id: ID });
    expect(interactors.updateWidgetLayouts).toHaveBeenCalledExactlyOnceWith({ layouts, expectedVersions });
  });

  it("returns a missing widget as 404", async () => {
    interactors.deleteWidget.mockResolvedValue({
      ok: false,
      error: createZodError("Missing", ["id"], { error: CustomErrorCode.widgetNotFound }),
    });

    expect((await deleteWidget(request({ id: ID }))).status).toBe(404);
  });
});

describe("model and Trash REST routes", () => {
  it("reads the full model on model/read and pages types on model/discover", async () => {
    interactors.getRecordModel.mockResolvedValue({ ok: true, data: { revision: 3 } });
    interactors.discoverRecordTypes.mockResolvedValue({ ok: true, data: { total: 0, types: [] } });

    expect(await (await readModel(request({ typeIds: [ID] }))).json()).toEqual({ revision: 3 });
    expect(await (await discoverModel(request({ search: "deal" }))).json()).toEqual({ total: 0, types: [] });
    expect(interactors.getRecordModel).toHaveBeenCalledExactlyOnceWith({ typeIds: [ID] });
    expect(interactors.discoverRecordTypes).toHaveBeenCalledExactlyOnceWith({ search: "deal" });
  });

  it("reads a trashed record and maps a record outside Trash to 404", async () => {
    interactors.getTrashedRecord
      .mockResolvedValueOnce({ ok: true, data: { typeId: ID, record: null } })
      .mockResolvedValueOnce({
        ok: false,
        error: createZodError("Missing", [], { error: CustomErrorCode.recordNotFound, kind: "not_found" }),
      });

    expect(await (await readTrashed(request({ typeId: ID, recordId: ID }))).json()).toEqual({
      typeId: ID,
      record: null,
    });
    expect((await readTrashed(request({ typeId: ID, recordId: ID }))).status).toBe(404);
  });
});
