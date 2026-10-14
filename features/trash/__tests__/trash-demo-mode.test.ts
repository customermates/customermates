import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { APP_MODE: "demo", NODE_ENV: "test" } }));

import { DemoModeError } from "@/core/errors/app-errors";
import { isAllowedInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { DeleteTrashPermanentlyInteractor } from "../delete-trash-permanently.interactor";
import { EmptyTrashInteractor } from "../empty-trash.interactor";
import { GetTrashedRecordInteractor } from "../get-trashed-record.interactor";
import { PreviewTrashDeletionInteractor } from "../preview-trash-deletion.interactor";
import { QueryTrashInteractor } from "../query-trash.interactor";
import { RestoreTrashInteractor } from "../restore-trash.interactor";

const untouched = () => {
  throw new Error("A demo refusal must not reach storage");
};
const trash = new Proxy({}, { get: untouched });

describe("Trash in demo mode", () => {
  it.each([
    [
      "restore",
      () => new RestoreTrashInteractor(trash as never, []).invoke({ itemIds: [crypto.randomUUID()] } as never),
    ],
    [
      "delete permanently",
      () =>
        new DeleteTrashPermanentlyInteractor(trash as never, []).invoke({
          itemIds: [crypto.randomUUID()],
          expectedImpactHash: "0".repeat(64),
        }),
    ],
    [
      "empty",
      () => new EmptyTrashInteractor(trash as never, trash as never, []).invoke({ expectedImpactHash: "0".repeat(64) }),
    ],
  ])("refuses to %s", async (_name, run) => {
    await expect(run()).rejects.toBeInstanceOf(DemoModeError);
  });

  it("keeps reading and previewing Trash available", () => {
    expect(isAllowedInDemoMode(QueryTrashInteractor)).toBe(true);
    expect(isAllowedInDemoMode(PreviewTrashDeletionInteractor)).toBe(true);
    expect(isAllowedInDemoMode(GetTrashedRecordInteractor)).toBe(true);
    expect(isAllowedInDemoMode(RestoreTrashInteractor)).toBe(false);
    expect(isAllowedInDemoMode(DeleteTrashPermanentlyInteractor)).toBe(false);
    expect(isAllowedInDemoMode(EmptyTrashInteractor)).toBe(false);
  });
});
