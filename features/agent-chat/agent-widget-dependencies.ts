import type { Prisma } from "@/generated/prisma";

export type AgentWidgetDependencyRow = {
  id: string;
  groupByCustomColumnId: string | null;
  entityFilters: Prisma.JsonValue;
  dealFilters: Prisma.JsonValue;
};

export const AGENT_WIDGET_LIVE_RESOURCE_WHERE = {
  isTemplate: false,
} satisfies Prisma.WidgetWhereInput;

export const AGENT_WIDGET_DEPENDENCY_SELECT = {
  id: true,
  groupByCustomColumnId: true,
  entityFilters: true,
  dealFilters: true,
} satisfies Prisma.WidgetSelect;

export function agentWidgetDependencyConfig(widget: AgentWidgetDependencyRow) {
  return {
    groupByCustomColumnId: widget.groupByCustomColumnId,
    entityFilters: widget.entityFilters,
    dealFilters: widget.dealFilters,
  };
}
