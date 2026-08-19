import type { ChartWidgetDto, DiagramDataPoint } from "../widget.schema";
import type { Filter } from "@/core/base/base-get.schema";

export type WidgetForCalculation = Pick<
  ChartWidgetDto,
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
  weightedValue: number | null;
  contacts?: { contact: { id: string; firstName: string | null; lastName: string | null } }[];
  organizations?: { organization: { id: string; name: string | null } }[];
  services?: { service: { id: string; name: string | null; amount: number }; quantity: number }[];
};
