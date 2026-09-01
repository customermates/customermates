import type { ColumnDef } from "@tanstack/react-table";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ operatorUsersStore: {} }),
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumericalShortDateTime: () => "" }),
}));

vi.mock("../components/use-operator-chip-options", () => ({
  PLATFORM_ACCESS_GRANTED: "granted",
  useOperatorChipOptions: () => ({ accountStatus: [], plan: [], subscription: [], platformAccess: [] }),
}));

vi.mock("../components/operator-chip-select", () => ({ OperatorChipSelect: () => null }));

vi.mock("../components/users/operator-user-credits-popover", () => ({ OperatorUserCreditsPopover: () => null }));

const { OperatorUsersStore } = await import("../components/users/operator-users.store");
const { useOperatorUserColumns } = await import("../components/users/use-operator-user-columns");

function renderedColumnIds(): string[] {
  let ids: string[] = [];
  const Probe = () => {
    ids = useOperatorUserColumns().map((column: ColumnDef<OperatorUserRowDto>) => (column as { id: string }).id);
    return null;
  };
  renderToStaticMarkup(createElement(Probe));
  return ids;
}

function declaredColumnUids(): string[] {
  const descriptor = Object.getOwnPropertyDescriptor(OperatorUsersStore.prototype, "columnsDefinition");
  if (!descriptor?.get) throw new Error("The operator users store must declare its columns.");
  return (descriptor.get.call({}) as TableColumn[]).map(({ uid }) => uid);
}

describe("operator user columns", () => {
  it("renders exactly the columns the store declares, in the same order", () => {
    expect(renderedColumnIds()).toEqual(declaredColumnUids());
  });
});
