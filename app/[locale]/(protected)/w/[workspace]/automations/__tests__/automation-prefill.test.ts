import { describe, expect, it, vi } from "vitest";

import type { AutomationBuilderModel } from "../components/automation-builder-model";

import { Action, Resource } from "@/generated/prisma";

import { canStartAutomation, prefillOpening } from "../components/automation-prefill";

const DEALS = "11111111-1111-4111-8111-111111111111";
const CLOSE = "22222222-2222-4222-8222-333333333333";

const MODEL: AutomationBuilderModel = {
  lists: [
    {
      id: DEALS,
      label: "Deal",
      primaryFieldId: null,
      unsupportedFieldIds: [],
      fields: [
        { id: CLOSE, label: "Close", valueType: "date", writable: true, multiple: false, currency: null, options: [] },
      ],
    },
  ],
  relationships: [],
};

describe("starting an automation from a list", () => {
  it("is offered to a member who may create automations, not to one who may only read them", () => {
    const reader = { can: vi.fn((_resource: Resource, action: Action) => action === Action.readAll) };
    const creator = { can: vi.fn(() => true) };

    expect(canStartAutomation(reader)).toBe(false);
    expect(reader.can).toHaveBeenCalledWith(Resource.routines, Action.create);
    expect(canStartAutomation(creator)).toBe(true);
  });

  it("opens no prefilled builder for a member who cannot save it", () => {
    const options = { model: MODEL, timezone: "Europe/Berlin" };

    expect(prefillOpening({ kind: "new", typeId: DEALS }, { ...options, canCreate: false })).toBeNull();
    expect(
      prefillOpening({ kind: "remind", typeId: DEALS, fieldId: CLOSE }, { ...options, canCreate: false }),
    ).toBeNull();
  });

  it("opens a new automation on the list, or a reminder on its date field, for a member who can", () => {
    const options = { model: MODEL, timezone: "Europe/Berlin", canCreate: true };

    expect(prefillOpening({ kind: "new", typeId: DEALS }, options)).toEqual({ typeId: DEALS });
    expect(prefillOpening({ kind: "remind", typeId: DEALS, fieldId: CLOSE }, options)).toMatchObject({
      typeId: DEALS,
      draft: { trigger: { kind: "dateReached", typeId: DEALS, fieldId: CLOSE, timezone: "Europe/Berlin" } },
    });
    expect(prefillOpening({ kind: "new", typeId: "gone" }, options)).toBeNull();
    expect(prefillOpening(null, options)).toBeNull();
  });
});
