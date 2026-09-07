import type { ColumnDef } from "@tanstack/react-table";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatNumber: () => "",
    formatNumericalShortDate: () => "",
    formatNumericalShortDateTime: () => "",
  }),
}));

vi.mock("@/app/[locale]/(protected)/company/components/subscription/subscription-panel", () => ({
  SUBSCRIPTION_STATUS_COLOR_MAP: {},
}));

const { OperatorWorkspacesStore } = await import("../components/workspaces/operator-workspaces.store");
const { useOperatorWorkspaceColumns } = await import("../components/workspaces/use-operator-workspace-columns");

function renderedColumnIds(): string[] {
  let ids: string[] = [];
  const Probe = () => {
    ids = useOperatorWorkspaceColumns().map(
      (column: ColumnDef<OperatorWorkspaceRowDto>) => (column as { id: string }).id,
    );
    return null;
  };
  renderToStaticMarkup(createElement(Probe));
  return ids;
}

function declaredColumnUids(): string[] {
  const descriptor = Object.getOwnPropertyDescriptor(OperatorWorkspacesStore.prototype, "columnsDefinition");
  if (!descriptor?.get) throw new Error("The operator workspaces store must declare its columns.");
  return (descriptor.get.call({}) as TableColumn[]).map(({ uid }) => uid);
}

describe("operator workspace columns", () => {
  it("renders exactly the columns the store declares, in the same order", () => {
    expect(renderedColumnIds()).toEqual(declaredColumnUids());
  });

  it("leads with the pinned identity column so board cards get the workspace as their heading", () => {
    expect(declaredColumnUids()[0]).toBe("name");
  });
});
