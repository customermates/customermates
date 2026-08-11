import type { PageSkeletonSpec } from "./page-skeleton";

export type ProtectedRouteKey = keyof typeof PROTECTED_ROUTE_REGISTRY;

export type ProtectedRouteSpec = {
  skeleton: PageSkeletonSpec;
  loadingOwner: string;
  trueEmpty: boolean;
};

export const PROTECTED_ROUTE_REGISTRY = {
  "/company/audit-logs": {
    skeleton: { kind: "data-view", tableVariant: "plain", view: "table" },
    loadingOwner: "/company/audit-logs",
    trueEmpty: true,
  },
  "/company/members": {
    skeleton: { kind: "data-view", tableVariant: "member", view: "table" },
    loadingOwner: "/company/members",
    trueEmpty: true,
  },
  "/company/roles": {
    skeleton: { kind: "data-view", tableVariant: "plain", view: "table" },
    loadingOwner: "/company/roles",
    trueEmpty: true,
  },
  "/company/settings": {
    skeleton: { kind: "settings" },
    loadingOwner: "/company/settings",
    trueEmpty: false,
  },
  "/company/subscription": {
    skeleton: { kind: "settings" },
    loadingOwner: "/company/subscription",
    trueEmpty: false,
  },
  "/company/webhook-deliveries": {
    skeleton: { kind: "data-view", tableVariant: "plain", view: "table" },
    loadingOwner: "/company/webhook-deliveries",
    trueEmpty: true,
  },
  "/company/webhooks": {
    skeleton: { kind: "data-view", tableVariant: "plain", view: "table" },
    loadingOwner: "/company/webhooks",
    trueEmpty: true,
  },
  "/contacts/[id]": {
    skeleton: { kind: "detail" },
    loadingOwner: "/contacts/[id]",
    trueEmpty: false,
  },
  "/dashboard": {
    skeleton: { kind: "dashboard" },
    loadingOwner: "/dashboard",
    trueEmpty: true,
  },
  "/deals/[id]": {
    skeleton: { kind: "detail" },
    loadingOwner: "/deals/[id]",
    trueEmpty: false,
  },
  "/deals": {
    skeleton: { kind: "data-view", tableVariant: "entity", view: "table" },
    loadingOwner: "/deals",
    trueEmpty: true,
  },
  "/inbox": {
    skeleton: { kind: "inbox" },
    loadingOwner: "/inbox",
    trueEmpty: true,
  },
  "/legal-update": {
    skeleton: { kind: "settings", view: "centered-card" },
    loadingOwner: "/legal-update",
    trueEmpty: false,
  },
  "/onboarding/wizard": {
    skeleton: { kind: "settings", view: "centered-card" },
    loadingOwner: "/onboarding/wizard",
    trueEmpty: false,
  },
  "/organizations/[id]": {
    skeleton: { kind: "detail" },
    loadingOwner: "/organizations/[id]",
    trueEmpty: false,
  },
  "/organizations": {
    skeleton: { kind: "data-view", tableVariant: "entity", view: "table" },
    loadingOwner: "/organizations",
    trueEmpty: true,
  },
  "/profile/api-keys": {
    skeleton: { card: "api-keys", kind: "settings", view: "cards" },
    loadingOwner: "/profile/api-keys",
    trueEmpty: true,
  },
  "/profile/connected-accounts": {
    skeleton: { card: "connected-accounts", kind: "settings", view: "cards" },
    loadingOwner: "/profile/connected-accounts",
    trueEmpty: true,
  },
  "/profile/settings": {
    skeleton: { kind: "settings" },
    loadingOwner: "/profile",
    trueEmpty: false,
  },
  "/services/[id]": {
    skeleton: { kind: "detail" },
    loadingOwner: "/services/[id]",
    trueEmpty: false,
  },
  "/services": {
    skeleton: { kind: "data-view", tableVariant: "entity", view: "table" },
    loadingOwner: "/services",
    trueEmpty: true,
  },
  "/subscription-expired": {
    skeleton: { kind: "settings", view: "centered-card", maxWidth: "3xl" },
    loadingOwner: "/subscription-expired",
    trueEmpty: false,
  },
  "/tasks/[id]": {
    skeleton: { kind: "detail" },
    loadingOwner: "/tasks/[id]",
    trueEmpty: false,
  },
  "/tasks": {
    skeleton: { kind: "data-view", tableVariant: "entity", view: "table" },
    loadingOwner: "/tasks",
    trueEmpty: true,
  },
} as const satisfies Record<string, ProtectedRouteSpec>;

export function getProtectedRouteSpec(route: ProtectedRouteKey): ProtectedRouteSpec {
  return PROTECTED_ROUTE_REGISTRY[route];
}
