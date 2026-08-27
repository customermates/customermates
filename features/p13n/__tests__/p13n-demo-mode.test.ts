import { describe, expect, it } from "vitest";

import { isAllowedInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

import { GetP13nInteractor } from "../get-p13n.interactor";
import { UpsertP13nInteractor } from "../upsert-p13n.interactor";

describe("P13n demo-mode policy", () => {
  it("allows seeded personalization reads while keeping shared demo writes blocked", () => {
    expect(isAllowedInDemoMode(GetP13nInteractor)).toBe(true);
    expect(isAllowedInDemoMode(UpsertP13nInteractor)).toBe(false);
  });
});
