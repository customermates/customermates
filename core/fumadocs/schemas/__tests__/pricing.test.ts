import { describe, expect, it } from "vitest";

import { PLAN_IDS } from "@/core/commercial/plan-catalog";
import { pricingDataSchema } from "../pricing";

function card(plan: (typeof PLAN_IDS)[number]) {
  return {
    plan,
    title: plan,
    description: plan,
    buttonText: "Select",
    buttonHref: "/auth/signup",
    buttonColor: "default" as const,
    buttonVariant: "solid" as const,
    features: [],
  };
}

function pricingCards(cards: ReturnType<typeof card>[]) {
  return {
    ariaLabelSlider: "Users",
    customPrice: "Custom",
    users: "users",
    pricingCards: cards,
  };
}

describe("pricingDataSchema", () => {
  it("requires exactly one card for every catalog plan", () => {
    expect(pricingDataSchema.parse(pricingCards(PLAN_IDS.map(card))).pricingCards).toHaveLength(PLAN_IDS.length);

    expect(() => pricingDataSchema.parse(pricingCards(PLAN_IDS.slice(1).map(card)))).toThrow("exactly one starter");
    expect(() => pricingDataSchema.parse(pricingCards([...PLAN_IDS.map(card), card("starter")]))).toThrow(
      "exactly one starter",
    );
  });
});
