import { createHmac, randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const localLemonSqueezyKey = "e2e-local-lemonsqueezy-no-network";
export const localLemonSqueezyStoreId = "910000";
export const localLemonSqueezyVariants = { starter: "910001", pro: "910002", business: "910003" };
export const localCheckoutOrigin = "https://customermates.lemonsqueezy.com";

export function localLemonSqueezyWebhookSecret(authSecret) {
  if (!authSecret) throw new Error("The local Lemon Squeezy webhook secret is derived from the local auth secret");
  return createHmac("sha256", authSecret).update("e2e-local-lemonsqueezy-webhook").digest("hex");
}

export function localLemonSqueezyEnvironment(authSecret) {
  return {
    LEMONSQUEEZY_API_KEY: localLemonSqueezyKey,
    LEMONSQUEEZY_WEBHOOK_SECRET: localLemonSqueezyWebhookSecret(authSecret),
    LEMONSQUEEZY_STORE_ID: localLemonSqueezyStoreId,
    LEMONSQUEEZY_VARIANT_ID_STARTER: localLemonSqueezyVariants.starter,
    LEMONSQUEEZY_VARIANT_ID_PRO: localLemonSqueezyVariants.pro,
    LEMONSQUEEZY_VARIANT_ID_BUSINESS: localLemonSqueezyVariants.business,
  };
}

function storeDirectory(providerDirectory, kind) {
  if (!providerDirectory) throw new Error("The local Lemon Squeezy provider requires its run directory");
  const directory = join(providerDirectory, "lemonsqueezy", kind);
  mkdirSync(directory, { recursive: true });
  return directory;
}

function writeJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2));
  renameSync(temporary, path);
}

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

export function readLocalCheckouts(providerDirectory) {
  const directory = storeDirectory(providerDirectory, "checkouts");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(join(directory, name)))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function readLocalSubscription(providerDirectory, subscriptionId) {
  return readJson(join(storeDirectory(providerDirectory, "subscriptions"), `${subscriptionId}.json`));
}

export function writeLocalSubscription(providerDirectory, subscription) {
  if (!/^[1-9]\d{0,15}$/.test(subscription.id)) throw new Error("Local subscriptions use numeric provider ids");
  writeJson(join(storeDirectory(providerDirectory, "subscriptions"), `${subscription.id}.json`), subscription);
}

export function newLocalSubscriptionIds() {
  return { id: String(randomInt(100_000_000, 999_999_999)), itemId: randomInt(100_000_000, 999_999_999) };
}

function jsonApi(status, body) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/vnd.api+json" } }),
  );
}

function notFound() {
  return jsonApi(404, { errors: [{ status: "404", title: "Not Found" }] });
}

async function createCheckout(request, providerDirectory) {
  const body = await request.json();
  const attributes = body?.data?.attributes ?? {};
  const relationships = body?.data?.relationships ?? {};
  const storeId = relationships.store?.data?.id;
  const variantId = relationships.variant?.data?.id;
  if (storeId !== localLemonSqueezyStoreId || !Object.values(localLemonSqueezyVariants).includes(variantId))
    return jsonApi(422, { errors: [{ status: "422", title: "Unknown local store or variant" }] });
  const id = randomUUID();
  const checkout = {
    id,
    createdAt: new Date().toISOString(),
    storeId,
    variantId,
    custom: attributes.checkout_data?.custom ?? null,
    variantQuantities: attributes.checkout_data?.variant_quantities ?? [],
    productName: attributes.product_options?.name ?? null,
    redirectUrl: attributes.product_options?.redirect_url ?? null,
    enabledVariants: attributes.product_options?.enabled_variants ?? [],
    skipTrial: attributes.checkout_options?.skip_trial ?? null,
    expiresAt: attributes.expires_at ?? null,
    url: `${localCheckoutOrigin}/checkout/custom/${id}?signature=${createHmac("sha256", localLemonSqueezyKey).update(id).digest("hex")}`,
  };
  writeJson(join(storeDirectory(providerDirectory, "checkouts"), `${id}.json`), checkout);
  return jsonApi(201, { data: { type: "checkouts", id, attributes: { url: checkout.url } } });
}

export function localSubscriptionResource(subscription) {
  return {
    type: "subscriptions",
    id: subscription.id,
    attributes: {
      ...subscription.attributes,
      first_subscription_item: {
        ...subscription.attributes.first_subscription_item,
        id: subscription.itemId,
        subscription_id: Number(subscription.id),
        quantity: subscription.quantity,
      },
    },
  };
}

function listLocalSubscriptions(providerDirectory, url) {
  const storeId = url.searchParams.get("filter[store_id]");
  const email = url.searchParams.get("filter[user_email]")?.toLowerCase();
  if (storeId !== localLemonSqueezyStoreId || !email)
    return jsonApi(422, { errors: [{ status: "422", title: "Unsupported subscription filter" }] });
  const directory = storeDirectory(providerDirectory, "subscriptions");
  const data = readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(join(directory, name)))
    .filter((subscription) => subscription.attributes.user_email?.toLowerCase() === email)
    .map(localSubscriptionResource);
  return jsonApi(200, { meta: { page: { currentPage: 1, lastPage: 1, total: data.length } }, data });
}

function subscriptionByItem(providerDirectory, itemId) {
  const directory = storeDirectory(providerDirectory, "subscriptions");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(join(directory, name)))
    .find((subscription) => String(subscription.itemId) === String(itemId));
}

async function updateSubscriptionItem(request, providerDirectory, itemId) {
  const subscription = subscriptionByItem(providerDirectory, itemId);
  if (!subscription) return notFound();
  const quantity = (await request.json())?.data?.attributes?.quantity;
  if (!Number.isInteger(quantity) || quantity < 1)
    return jsonApi(422, { errors: [{ status: "422", title: "Invalid quantity" }] });
  const updated = { ...subscription, quantity, quantityUpdates: [...(subscription.quantityUpdates ?? []), quantity] };
  writeLocalSubscription(providerDirectory, updated);
  return jsonApi(200, {
    data: {
      type: "subscription-items",
      id: String(itemId),
      attributes: { subscription_id: Number(updated.id), quantity },
    },
  });
}

export function localLemonSqueezyRequest(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://api.lemonsqueezy.com" || process.env.LEMONSQUEEZY_API_KEY !== localLemonSqueezyKey)
    return null;
  const request = new Request(input, init);
  if (request.headers.get("Authorization") !== `Bearer ${localLemonSqueezyKey}` || url.username || url.password)
    return null;
  const providerDirectory = process.env.CRM_E2E_PROVIDER_DIRECTORY;
  if (request.method === "POST" && url.pathname === "/v1/checkouts" && !url.search)
    return createCheckout(request, providerDirectory);
  if (request.method === "GET" && url.pathname === "/v1/subscriptions")
    return listLocalSubscriptions(providerDirectory, url);
  const subscription = url.pathname.match(/^\/v1\/subscriptions\/([1-9]\d{0,15})$/);
  if (request.method === "GET" && subscription && !url.search) {
    const stored = readLocalSubscription(providerDirectory, subscription[1]);
    return stored ? jsonApi(200, { data: localSubscriptionResource(stored) }) : notFound();
  }
  if (request.method === "GET" && url.pathname === "/v1/subscription-items") {
    const subscriptionId = url.searchParams.get("filter[subscription_id]");
    const stored =
      subscriptionId && /^[1-9]\d{0,15}$/.test(subscriptionId)
        ? readLocalSubscription(providerDirectory, subscriptionId)
        : null;
    return jsonApi(200, {
      data: stored
        ? [
            {
              type: "subscription-items",
              id: String(stored.itemId),
              attributes: { subscription_id: Number(stored.id), quantity: stored.quantity },
            },
          ]
        : [],
    });
  }
  const item = url.pathname.match(/^\/v1\/subscription-items\/([1-9]\d{0,15})$/);
  if (request.method === "PATCH" && item && !url.search)
    return updateSubscriptionItem(request, providerDirectory, item[1]);
  return null;
}
