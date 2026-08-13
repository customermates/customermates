import { CONTENT_DYNAMIC_ROUTES } from "@/core/fumadocs/content-route-contract";

export const LANDING_HUBS = [
  {
    collection: "blog-posts",
    detailPath: "/blog",
    detailRoute: CONTENT_DYNAMIC_ROUTES.blogPost.route,
    hubPath: "/blog",
    pageCount: 3,
  },
  {
    collection: "compare-pages",
    detailPath: "/compare",
    detailRoute: CONTENT_DYNAMIC_ROUTES.comparison.route,
    hubPath: "/compare",
    pageCount: 2,
  },
  {
    collection: "feature-pages",
    detailPath: "/features",
    detailRoute: CONTENT_DYNAMIC_ROUTES.feature.route,
    hubPath: "/features/all",
    pageCount: 1,
  },
  {
    collection: "for-pages",
    detailPath: "/for",
    detailRoute: CONTENT_DYNAMIC_ROUTES.industry.route,
    hubPath: "/for",
    pageCount: 2,
  },
] as const;

export type LandingHub = (typeof LANDING_HUBS)[number];
