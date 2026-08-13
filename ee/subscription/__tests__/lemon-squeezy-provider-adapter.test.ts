import { describe, expect, it } from "vitest";

import {
  providerOfferSnapshotFromResponses,
  providerProductIdFromVariantResponse,
} from "../lemon-squeezy-provider-adapter";

const STORE_RESPONSE = { data: { id: "10", attributes: { currency: "EUR" } } };
const VARIANT_RESPONSE = {
  data: {
    id: "2002",
    attributes: { product_id: 101, status: "published", test_mode: true },
  },
};
const PRODUCT_RESPONSE = {
  data: {
    id: "101",
    attributes: { store_id: 10, status: "published", test_mode: true },
  },
};
const PRICES_RESPONSE = {
  data: [
    {
      attributes: {
        category: "subscription",
        scheme: "standard",
        usage_aggregation: null,
        unit_price: 2_900,
        unit_price_decimal: null,
        setup_fee_enabled: false,
        setup_fee: null,
        package_size: 1,
        renewal_interval_unit: "month",
        renewal_interval_quantity: 1,
        trial_interval_unit: null,
        trial_interval_quantity: null,
      },
    },
  ],
};

describe("Lemon Squeezy provider response adapter", () => {
  it("adapts the installed SDK response shape without assuming store test mode", () => {
    expect(providerProductIdFromVariantResponse(VARIANT_RESPONSE)).toBe(101);
    expect(
      providerOfferSnapshotFromResponses({
        configuredStoreId: "10",
        storeResponse: STORE_RESPONSE,
        variantResponse: VARIANT_RESPONSE,
        productResponse: PRODUCT_RESPONSE,
        pricesResponse: PRICES_RESPONSE,
      }),
    ).toEqual({
      testMode: true,
      variantStatus: "published",
      currency: "EUR",
      category: "subscription",
      scheme: "standard",
      unitPriceMinor: 2_900,
      unitPriceDecimal: null,
      usageAggregation: null,
      setupFeeEnabled: false,
      setupFeeMinor: null,
      packageSize: 1,
      renewalIntervalUnit: "month",
      renewalIntervalQuantity: 1,
      trialIntervalUnit: null,
      trialIntervalQuantity: null,
    });
  });

  it("rejects a variant whose product belongs to another store", () => {
    expect(() =>
      providerOfferSnapshotFromResponses({
        configuredStoreId: "11",
        storeResponse: STORE_RESPONSE,
        variantResponse: VARIANT_RESPONSE,
        productResponse: PRODUCT_RESPONSE,
        pricesResponse: PRICES_RESPONSE,
      }),
    ).toThrow("configured Lemon Squeezy store");
  });

  it("uses the newest retained price after a provider price edit", () => {
    const result = providerOfferSnapshotFromResponses({
      configuredStoreId: "10",
      storeResponse: STORE_RESPONSE,
      variantResponse: VARIANT_RESPONSE,
      productResponse: PRODUCT_RESPONSE,
      pricesResponse: {
        data: [
          ...PRICES_RESPONSE.data,
          {
            attributes: {
              ...PRICES_RESPONSE.data[0].attributes,
              unit_price: 2_400,
            },
          },
        ],
      },
    });

    expect(result.unitPriceMinor).toBe(2_900);
  });

  it("rejects a draft parent product and a missing price", () => {
    expect(() =>
      providerOfferSnapshotFromResponses({
        configuredStoreId: "10",
        storeResponse: STORE_RESPONSE,
        variantResponse: VARIANT_RESPONSE,
        productResponse: {
          data: {
            id: "101",
            attributes: { store_id: 10, status: "draft", test_mode: true },
          },
        },
        pricesResponse: PRICES_RESPONSE,
      }),
    ).toThrow("draft Lemon Squeezy product");

    expect(() =>
      providerOfferSnapshotFromResponses({
        configuredStoreId: "10",
        storeResponse: STORE_RESPONSE,
        variantResponse: VARIANT_RESPONSE,
        productResponse: PRODUCT_RESPONSE,
        pricesResponse: { data: [] },
      }),
    ).toThrow("no provider price");
  });
});
