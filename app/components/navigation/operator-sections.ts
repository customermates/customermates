export type OperatorSubroute = { slug: string; labelKey: string };

export const OPERATOR_SUBROUTES: readonly OperatorSubroute[] = [
  { slug: "overview", labelKey: "OperatorOverview.navigation" },
  { slug: "users", labelKey: "OperatorUsers.navigation" },
  { slug: "workspaces", labelKey: "OperatorWorkspaces.navigation" },
  { slug: "audit", labelKey: "OperatorAudit.navigation" },
];
