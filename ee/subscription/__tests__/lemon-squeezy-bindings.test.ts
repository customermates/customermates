import { describe, expect, it } from "vitest";

import { getCommercialOfferOrThrow } from "@/core/commercial/plan-catalog";
import { parseLemonSqueezyBindings, type LemonSqueezyBindingEnvironment } from "../lemon-squeezy-binding-contract";
import { offerToVariant, variantToOffer, variantToOfferOrThrow } from "../lemon-squeezy-bindings";

const VALID_ENV: LemonSqueezyBindingEnvironment = {
  LEMONSQUEEZY_VARIANT_ID_STARTER: "2001",
  LEMONSQUEEZY_VARIANT_ID_PRO: "2002",
  LEMONSQUEEZY_VARIANT_ID_BUSINESS: "2003",
};

describe("Lemon Squeezy offer bindings", () => {
  it("forms an exact forward and reverse bijection for every available offer", () => {
    const bindings = parseLemonSqueezyBindings(VALID_ENV);
    expect(bindings.byOffer).toEqual({
      "starter:monthly": {
        checkoutVariantId: "2001",
      },
      "pro:monthly": {
        checkoutVariantId: "2002",
      },
      "business:monthly": {
        checkoutVariantId: "2003",
      },
    });
    expect(offerToVariant(getCommercialOfferOrThrow("pro", "monthly"), VALID_ENV)).toBe("2002");
    expect(variantToOffer("2003", VALID_ENV)?.id).toBe("business:monthly");
  });

  it.each([
    ["missing", { ...VALID_ENV, LEMONSQUEEZY_VARIANT_ID_PRO: undefined }],
    ["blank", { ...VALID_ENV, LEMONSQUEEZY_VARIANT_ID_PRO: " " }],
    ["non-numeric", { ...VALID_ENV, LEMONSQUEEZY_VARIANT_ID_PRO: "pro" }],
    ["zero", { ...VALID_ENV, LEMONSQUEEZY_VARIANT_ID_PRO: "0" }],
    ["unsafe", { ...VALID_ENV, LEMONSQUEEZY_VARIANT_ID_PRO: "9007199254740992" }],
  ])("rejects a %s configured variant", (_label, input) => {
    expect(() => parseLemonSqueezyBindings(input)).toThrow();
  });

  it("rejects duplicate IDs before reverse mapping can become ambiguous", () => {
    expect(() =>
      parseLemonSqueezyBindings({
        ...VALID_ENV,
        LEMONSQUEEZY_VARIANT_ID_BUSINESS: "2002",
      }),
    ).toThrow("globally unique");
  });

  it("rejects Enterprise and excess checkout bindings", () => {
    expect(() =>
      parseLemonSqueezyBindings({
        ...VALID_ENV,
        LEMONSQUEEZY_VARIANT_ID_ENTERPRISE: "2004",
      } as LemonSqueezyBindingEnvironment),
    ).toThrow("Enterprise and excess variants are not allowed");
  });

  it("fails closed when a webhook names an unknown variant", () => {
    expect(variantToOffer("9999", VALID_ENV)).toBeNull();
    expect(() => variantToOfferOrThrow("9999", VALID_ENV)).toThrow("Unknown Lemon Squeezy variant");
  });
});
