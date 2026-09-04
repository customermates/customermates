import type { PublicAdAttributionCookie } from "./ad-attribution.schema";

export abstract class AdAttributionCookieRepo {
  abstract readCookie(): Promise<PublicAdAttributionCookie | null>;
  abstract writeCookie(value: PublicAdAttributionCookie): Promise<boolean>;
}
