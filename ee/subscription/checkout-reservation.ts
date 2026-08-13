import "server-only";

import { z } from "zod";

import type { CommercialOffer, OfferId } from "@/core/commercial/plan-catalog";

import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";

const DOMAIN = "checkout-reservation:v1";

const PayloadSchema = z.object({
  companyId: z.uuid(),
  offerId: z.custom<OfferId>((value) => typeof value === "string" && /^(starter|pro|business):monthly$/.test(value)),
  quantity: z.number().int().positive(),
  checkoutExpiresAt: z.iso.datetime(),
  bindingExpiresAt: z.iso.datetime(),
});

export type CheckoutReservationPayload = z.infer<typeof PayloadSchema>;

export type CheckoutReservation = {
  marker: string;
  token: string;
  payload: CheckoutReservationPayload;
};

function encodePayload(payload: CheckoutReservationPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function createCheckoutReservation(options: {
  secret: string;
  companyId: string;
  offer: CommercialOffer;
  quantity: number;
  checkoutExpiresAt: Date;
  bindingExpiresAt: Date;
}): CheckoutReservation {
  if (!options.secret) throw new Error("LEMONSQUEEZY_WEBHOOK_SECRET is required to authorize checkout binding");
  if (options.bindingExpiresAt <= options.checkoutExpiresAt)
    throw new Error("Checkout binding authorization must outlive the provider checkout URL");

  const payload = PayloadSchema.parse({
    companyId: options.companyId,
    offerId: options.offer.id,
    quantity: options.quantity,
    checkoutExpiresAt: options.checkoutExpiresAt.toISOString(),
    bindingExpiresAt: options.bindingExpiresAt.toISOString(),
  });
  const encoded = encodePayload(payload);
  const signedValue = `${DOMAIN}:${encoded}`;
  const token = hmacSha256Hex(options.secret, signedValue);

  return { marker: `${signedValue}:${token}`, token, payload };
}

export function parseCheckoutReservationMarker(marker: string | null | undefined): CheckoutReservation | null {
  if (!marker?.startsWith(`${DOMAIN}:`)) return null;
  const remainder = marker.slice(DOMAIN.length + 1);
  const [encoded, token, ...extra] = remainder.split(":");
  if (!encoded || !token || extra.length > 0 || !/^[a-f\d]{64}$/i.test(token)) return null;

  try {
    const payload = PayloadSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    return { marker, token, payload };
  } catch {
    return null;
  }
}

export function checkoutReservationMatches(options: {
  marker: string | null | undefined;
  token: string | null | undefined;
  secret: string;
  companyId: string;
  offer: CommercialOffer;
  quantity: number | undefined;
  now?: Date;
}): boolean {
  const reservation = verifyCheckoutReservation(options);
  return Boolean(
    reservation &&
      reservation.payload.offerId === options.offer.id &&
      reservation.payload.quantity === options.quantity,
  );
}

export function verifyCheckoutReservation(options: {
  marker: string | null | undefined;
  token: string | null | undefined;
  secret: string;
  companyId: string;
  now?: Date;
}): CheckoutReservation | null {
  const reservation = parseCheckoutReservationMarker(options.marker);
  if (!reservation || !options.token || !options.secret) return null;

  const encoded = reservation.marker.slice(DOMAIN.length + 1).split(":")[0];
  const now = options.now ?? new Date();
  if (
    reservation.token !== options.token ||
    !verifyHmacSha256Hex(options.secret, `${DOMAIN}:${encoded}`, options.token) ||
    reservation.payload.companyId !== options.companyId ||
    new Date(reservation.payload.bindingExpiresAt) <= now
  )
    return null;

  return reservation;
}
