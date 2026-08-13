export const CONTENT_DYNAMIC_ROUTES = {
  blogPost: { collection: "blog-posts", route: "/blog/:slug" },
  comparison: { collection: "compare-pages", route: "/compare/:competitor" },
  doc: { collection: "docs", route: "/docs/:slug" },
  feature: { collection: "feature-pages", route: "/features/:slug" },
  industry: { collection: "for-pages", route: "/for/:industry" },
  openApiDoc: { collection: "api", route: "/docs/openapi/:slug" },
} as const;

export const UNBACKED_DYNAMIC_PUBLIC_ROUTES = ["/invitation/:token"] as const;
