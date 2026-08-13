import { getProduct, getStore, getVariant, lemonSqueezySetup, listPrices } from "@lemonsqueezy/lemonsqueezy.js";

import { COMMERCIAL_OFFERS } from "@/core/commercial/plan-catalog";
import {
  parseLemonSqueezyBindings,
  type LemonSqueezyBindingEnvironment,
} from "@/ee/subscription/lemon-squeezy-binding-contract";
import { assertProviderOfferMatchesCatalog } from "@/ee/subscription/provider-offer-verification";
import {
  providerOfferSnapshotFromResponses,
  providerProductIdFromVariantResponse,
} from "@/ee/subscription/lemon-squeezy-provider-adapter";

async function verify() {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!apiKey) throw new Error("LEMONSQUEEZY_API_KEY is required for explicit provider verification");
  if (!storeId) throw new Error("LEMONSQUEEZY_STORE_ID is required for explicit provider verification");

  // Keep this diagnostic independent from the application's full environment
  // schema so unrelated OAuth or deployment variables cannot block it.
  const bindingEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.startsWith("LEMONSQUEEZY_VARIANT_ID_")),
  ) as LemonSqueezyBindingEnvironment;
  const bindings = parseLemonSqueezyBindings(bindingEnvironment);
  lemonSqueezySetup({ apiKey });

  const storeResult = await getStore(storeId);
  if (storeResult.error) throw new Error(storeResult.error.message || "Failed to read the Lemon Squeezy store");

  for (const offer of COMMERCIAL_OFFERS) {
    const variantId = bindings.byOffer[offer.id].checkoutVariantId;
    const variantResult = await getVariant(variantId);
    if (variantResult.error) throw new Error(`${offer.id}: failed to read the configured variant`);

    const productId = providerProductIdFromVariantResponse(variantResult.data);
    const [productResult, pricesResult] = await Promise.all([
      getProduct(productId),
      listPrices({ filter: { variantId } }),
    ]);
    if (productResult.error) throw new Error(`${offer.id}: failed to read the configured product`);
    if (pricesResult.error) throw new Error(`${offer.id}: failed to read the configured price`);

    const snapshot = providerOfferSnapshotFromResponses({
      configuredStoreId: storeId,
      storeResponse: storeResult.data,
      variantResponse: variantResult.data,
      productResponse: productResult.data,
      pricesResponse: pricesResult.data,
    });

    assertProviderOfferMatchesCatalog(snapshot, offer);

    console.log(`verified ${offer.id}`);
  }
}

verify().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Billing catalog verification failed");
  process.exitCode = 1;
});
