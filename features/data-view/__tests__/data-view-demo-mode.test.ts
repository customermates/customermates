import { describe, expect, it } from "vitest";

import { isAllowedInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

import { ApplyDataViewOverrideInteractor } from "../apply-data-view-override.interactor";
import { DeleteDataViewInteractor } from "../delete-data-view.interactor";
import { GetDataViewsInteractor } from "../get-data-views.interactor";
import { SelectDataViewInteractor } from "../select-data-view.interactor";
import { UpsertDataViewInteractor } from "../upsert-data-view.interactor";

describe("data view demo-mode policy", () => {
  it("opens the read and keeps every write closed", () => {
    expect(isAllowedInDemoMode(GetDataViewsInteractor)).toBe(true);
    expect(isAllowedInDemoMode(UpsertDataViewInteractor)).toBe(false);
    expect(isAllowedInDemoMode(DeleteDataViewInteractor)).toBe(false);
    expect(isAllowedInDemoMode(ApplyDataViewOverrideInteractor)).toBe(false);
    expect(isAllowedInDemoMode(SelectDataViewInteractor)).toBe(false);
  });
});
