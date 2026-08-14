import type { PUBLIC_ROUTES } from "@/i18n/routing";

type PublicRoute = (typeof PUBLIC_ROUTES)[number];
type DynamicPublicRoute = Extract<PublicRoute, `${string}/:${string}`>;

function landingHub<
  const Collection extends string,
  const DetailRoute extends DynamicPublicRoute,
  const HubPath extends string,
>(config: { collection: Collection; detailRoute: DetailRoute; hubPath: HubPath; pageCount: number }) {
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
    pageCount: 3,
  }),
  landingHub({
    collection: "compare-pages",
    detailRoute: "/compare/:competitor",
    hubPath: "/compare",
    pageCount: 2,
  }),
  landingHub({
    collection: "feature-pages",
    detailRoute: "/features/:slug",
    hubPath: "/features/all",
    pageCount: 1,
  }),
  landingHub({
    collection: "for-pages",
    detailRoute: "/for/:industry",
    hubPath: "/for",
    pageCount: 2,
  }),
] as const;

export type LandingHub = (typeof LANDING_HUBS)[number];
