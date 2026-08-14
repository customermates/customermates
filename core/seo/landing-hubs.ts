import type { PUBLIC_ROUTES } from "@/i18n/routing";

type PublicRoute = (typeof PUBLIC_ROUTES)[number];
type DynamicPublicRoute = Extract<PublicRoute, `${string}/:${string}`>;

function landingHub<
  const Collection extends string,
  const DetailRoute extends DynamicPublicRoute,
  const HubPath extends string,
>(config: { collection: Collection; detailRoute: DetailRoute; hubPath: HubPath }) {
  return {
    ...config,
    detailPath: config.detailRoute.slice(0, config.detailRoute.lastIndexOf("/")),
  };
}

export const LANDING_HUBS = [
  landingHub({
    collection: "blog-posts",
    detailRoute: "/blog/:slug",
    hubPath: "/blog",
  }),
  landingHub({
    collection: "compare-pages",
    detailRoute: "/compare/:competitor",
    hubPath: "/compare",
  }),
  landingHub({
    collection: "feature-pages",
    detailRoute: "/features/:slug",
    hubPath: "/features/all",
  }),
  landingHub({
    collection: "for-pages",
    detailRoute: "/for/:industry",
    hubPath: "/for",
  }),
] as const;

export type LandingHub = (typeof LANDING_HUBS)[number];
