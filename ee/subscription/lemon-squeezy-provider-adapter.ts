import { z } from "zod";

import type { ProviderOfferSnapshot } from "./provider-offer-verification";

const StoreResponse = z.looseObject({
  data: z.looseObject({
    attributes: z.looseObject({
      currency: z.string(),
    }),
  }),
});

const VariantResponse = z.looseObject({
  data: z.looseObject({
    attributes: z.looseObject({
      product_id: z.number().int().positive(),
      status: z.enum(["pending", "draft", "published"]),
      test_mode: z.boolean(),
    }),
  }),
});

const ProductResponse = z.looseObject({
  data: z.looseObject({
    id: z.union([z.string(), z.number()]),
    attributes: z.looseObject({
      store_id: z.number().int().positive(),
      status: z.enum(["draft", "published"]),
      test_mode: z.boolean(),
    }),
  }),
});

const PricesResponse = z.looseObject({
  data: z.array(
    z.looseObject({
      attributes: z.looseObject({
        category: z.enum(["one_time", "subscription", "lead_magnet", "pwyw"]),
        scheme: z.enum(["standard", "package", "graduated", "volume"]),
        usage_aggregation: z.string().nullable(),
        unit_price: z.number().nullable(),
        unit_price_decimal: z.string().nullable(),
        setup_fee_enabled: z.boolean().nullable(),
        setup_fee: z.number().nullable(),
        package_size: z.number(),
        renewal_interval_unit: z.string().nullable(),
        renewal_interval_quantity: z.number().nullable(),
        trial_interval_unit: z.string().nullable(),
        trial_interval_quantity: z.number().nullable(),
      }),
    }),
  ),
});

export function providerProductIdFromVariantResponse(response: unknown): number {
  return VariantResponse.parse(response).data.attributes.product_id;
}

export function providerOfferSnapshotFromResponses(input: {
  configuredStoreId: string;
  storeResponse: unknown;
  variantResponse: unknown;
  productResponse: unknown;
  pricesResponse: unknown;
}): ProviderOfferSnapshot {
  const store = StoreResponse.parse(input.storeResponse).data.attributes;
  const variant = VariantResponse.parse(input.variantResponse).data.attributes;
  const productData = ProductResponse.parse(input.productResponse).data;
  const product = productData.attributes;
  const prices = PricesResponse.parse(input.pricesResponse).data;

  if (String(productData.id) !== String(variant.product_id))
    throw new Error("Configured variant does not belong to the fetched Lemon Squeezy product");

  if (String(product.store_id) !== input.configuredStoreId.trim())
    throw new Error("Configured variant does not belong to the configured Lemon Squeezy store");

  if (product.status !== "published") throw new Error("Configured variant belongs to a draft Lemon Squeezy product");
  if (prices.length === 0) throw new Error("Configured variant has no provider price");

  const price = prices[0].attributes;
  return {
    testMode: variant.test_mode && product.test_mode,
    variantStatus: variant.status,
    currency: store.currency,
    category: price.category,
    scheme: price.scheme,
    unitPriceMinor: price.unit_price,
    unitPriceDecimal: price.unit_price_decimal,
    usageAggregation: price.usage_aggregation,
    setupFeeEnabled: price.setup_fee_enabled,
    setupFeeMinor: price.setup_fee,
    packageSize: price.package_size,
    renewalIntervalUnit: price.renewal_interval_unit,
    renewalIntervalQuantity: price.renewal_interval_quantity,
    trialIntervalUnit: price.trial_interval_unit,
    trialIntervalQuantity: price.trial_interval_quantity,
  };
}
