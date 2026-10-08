import type { LucideIcon } from "lucide-react";

import { Building, LayoutGrid, ScrollText, Users } from "lucide-react";

export type OperatorSubroute = { slug: string; labelKey: string; icon: LucideIcon };

export const OPERATOR_SUBROUTES: readonly OperatorSubroute[] = [
  { slug: "overview", labelKey: "OperatorOverview.navigation", icon: LayoutGrid },
  { slug: "users", labelKey: "OperatorUsers.navigation", icon: Users },
  { slug: "workspaces", labelKey: "OperatorWorkspaces.navigation", icon: Building },
  { slug: "audit", labelKey: "OperatorAudit.navigation", icon: ScrollText },
];
