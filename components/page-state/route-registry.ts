import type { PageSkeletonSpec } from "./page-skeleton";

export type ProtectedRouteKey = keyof typeof PROTECTED_ROUTE_REGISTRY;

export type ProtectedRouteSpec = {
  skeleton: PageSkeletonSpec;
  loadingOwner: string;
  trueEmpty: boolean;
  errorOwner: "route-boundary" | "route-boundary-and-refresh" | "detail-state-and-route-boundary";
};

export const PROTECTED_ROUTE_REGISTRY = {
  "/company/audit-logs": {
    skeleton: { kind: "data-view", view: "table" },
    loadingOwner: "/company/audit-logs",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
  "/company/members": {
    skeleton: { kind: "data-view", view: "table" },
    loadingOwner: "/company/members",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
  "/company/roles": {
    skeleton: { kind: "data-view", view: "table" },
    loadingOwner: "/company/roles",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
  "/company/settings": {
    skeleton: { kind: "settings" },
    loadingOwner: "/company/settings",
    trueEmpty: false,
    errorOwner: "route-boundary",
  },
  "/company/subscription": {
    skeleton: { kind: "settings" },
    loadingOwner: "/company/subscription",
    trueEmpty: false,
    errorOwner: "route-boundary",
  },
  "/company/webhook-deliveries": {
    skeleton: { kind: "data-view", view: "table" },
    loadingOwner: "/company/webhook-deliveries",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
  "/company/webhooks": {
    skeleton: { kind: "data-view", view: "table" },
    loadingOwner: "/company/webhooks",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
  "/contacts/[id]": {
    skeleton: { kind: "detail" },
    loadingOwner: "/contacts/[id]",
    trueEmpty: false,
    errorOwner: "detail-state-and-route-boundary",
  },
  "/contacts": {
    skeleton: { kind: "data-view", view: "table" },
    loadingOwner: "/contacts",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
  "/dashboard": {
    skeleton: { kind: "dashboard" },
    loadingOwner: "/dashboard",
    trueEmpty: true,
    errorOwner: "route-boundary",
  },
  "/deals/[id]": {
    skeleton: { kind: "detail" },
    loadingOwner: "/deals/[id]",
    trueEmpty: false,
    errorOwner: "detail-state-and-route-boundary",
  },
  "/deals": {
    skeleton: { kind: "data-view", view: "table" },
    loadingOwner: "/deals",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
  "/inbox": {
    skeleton: { kind: "inbox" },
    loadingOwner: "/inbox",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
  "/legal-update": {
    skeleton: { kind: "settings", view: "centered-card" },
    loadingOwner: "/legal-update",
    trueEmpty: false,
    errorOwner: "route-boundary",
  },
  "/onboarding/wizard": {
    skeleton: { kind: "settings", view: "centered-card" },
    loadingOwner: "/onboarding/wizard",
    trueEmpty: false,
    errorOwner: "route-boundary",
  },
  "/organizations/[id]": {
    skeleton: { kind: "detail" },
    loadingOwner: "/organizations/[id]",
    trueEmpty: false,
    errorOwner: "detail-state-and-route-boundary",
  },
  "/organizations": {
    skeleton: { kind: "data-view", view: "table" },
    loadingOwner: "/organizations",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
  "/profile/api-keys": {
    skeleton: { kind: "settings" },
    loadingOwner: "/profile",
    trueEmpty: true,
    errorOwner: "route-boundary",
  },
  "/profile/connected-accounts": {
    skeleton: { kind: "settings" },
    loadingOwner: "/profile",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
  "/profile/settings": {
    skeleton: { kind: "settings" },
    loadingOwner: "/profile",
    trueEmpty: false,
    errorOwner: "route-boundary",
  },
  "/services/[id]": {
    skeleton: { kind: "detail" },
    loadingOwner: "/services/[id]",
    trueEmpty: false,
    errorOwner: "detail-state-and-route-boundary",
  },
  "/services": {
    skeleton: { kind: "data-view", view: "table" },
    loadingOwner: "/services",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
  "/subscription-expired": {
    skeleton: { kind: "settings", view: "centered-card" },
    loadingOwner: "/subscription-expired",
    trueEmpty: false,
    errorOwner: "route-boundary",
  },
  "/tasks/[id]": {
    skeleton: { kind: "detail" },
    loadingOwner: "/tasks/[id]",
    trueEmpty: false,
    errorOwner: "detail-state-and-route-boundary",
  },
  "/tasks": {
    skeleton: { kind: "data-view", view: "table" },
    loadingOwner: "/tasks",
    trueEmpty: true,
    errorOwner: "route-boundary-and-refresh",
  },
} as const satisfies Record<string, ProtectedRouteSpec>;

export function getProtectedRouteSpec(route: ProtectedRouteKey): ProtectedRouteSpec {
  return PROTECTED_ROUTE_REGISTRY[route];
}
