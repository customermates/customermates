import type { DiagramDataPoint } from "../widget.schema";
import type { Filter } from "@/core/base/base-get.schema";

import type { Widget } from "@/generated/prisma";

export type WidgetForCalculation = Pick<
  Widget,
  "entityType" | "groupByType" | "groupByCustomColumnId" | "aggregationType"
> & {
  entityFilters: Filter[];
  dealFilters: Filter[];
};

export type GroupAccumulator = Map<string, DiagramDataPoint>;

export type EntityForGrouping = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
};

export type DealRecord = {
  id: string;
  name: string | null;
  totalValue: number;
  totalQuantity: number;
  contacts?: { contact: { id: string; firstName: string | null; lastName: string | null } }[];
  organizations?: { organization: { id: string; name: string | null } }[];
  services?: { service: { id: string; name: string | null; amount: number }; quantity: number }[];
};
