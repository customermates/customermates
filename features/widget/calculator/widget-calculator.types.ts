import type { DiagramDataPoint } from "../widget.types";

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
