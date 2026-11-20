import { describe, expect, it } from "vitest";

import { automationOffers, canOfferScheduleMeeting } from "../record-offers";

const TYPE_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_TYPE_ID = "10000000-0000-4000-8000-000000000002";

function field(overrides: Partial<Parameters<typeof automationOffers>[0]["fields"][number]> = {}) {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    typeId: TYPE_ID,
    label: "Due date",
    valueType: "date" as const,
    archived: false,
    ...overrides,
  };
}

describe("automationOffers", () => {
  it("offers the automation link and a reminder per date field when the user has routines access", () => {
    const offers = automationOffers({
      canUseAutomations: true,
      typeId: TYPE_ID,
      fields: [field(), field({ id: "20000000-0000-4000-8000-000000000002", label: "Starts", valueType: "dateTime" })],
    });

    expect(offers.automateHref).toBe(`/automations?new=${TYPE_ID}`);
    expect(offers.reminders).toEqual([
      {
        id: "20000000-0000-4000-8000-000000000001",
        label: "Due date",
        href: `/automations?remind=${TYPE_ID}:20000000-0000-4000-8000-000000000001`,
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        label: "Starts",
        href: `/automations?remind=${TYPE_ID}:20000000-0000-4000-8000-000000000002`,
      },
    ]);
  });

  it("offers nothing without routines access", () => {
    expect(automationOffers({ canUseAutomations: false, typeId: TYPE_ID, fields: [field()] })).toEqual({
      automateHref: undefined,
      reminders: [],
    });
  });

  it("skips archived fields, fields of other lists and fields that hold no date", () => {
    const offers = automationOffers({
      canUseAutomations: true,
      typeId: TYPE_ID,
      fields: [
        field({ archived: true }),
        field({ id: "20000000-0000-4000-8000-000000000003", typeId: OTHER_TYPE_ID }),
        field({ id: "20000000-0000-4000-8000-000000000004", valueType: "text" }),
      ],
    });

    expect(offers.reminders).toEqual([]);
  });
});

describe("canOfferScheduleMeeting", () => {
  it("hides the action on self-hosted, where it only opens a not-available notice", () => {
    expect(canOfferScheduleMeeting("self-hosted")).toBe(false);
  });

  it("keeps the action in Cloud and in demo mode", () => {
    expect(canOfferScheduleMeeting("cloud")).toBe(true);
    expect(canOfferScheduleMeeting("demo")).toBe(true);
  });
});
