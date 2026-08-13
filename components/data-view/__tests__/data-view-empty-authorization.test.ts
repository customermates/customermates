import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { DataViewEmpty } from "../data-view-empty";

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: () => "records", singular: () => "record" }),
}));

type Item = HasId;

function store(canManage: boolean): BaseDataViewStore<Item> {
  return {
    canManage,
    entityType: undefined,
    setQueryOptions: vi.fn(),
  } as unknown as BaseDataViewStore<Item>;
}

function render(canManage: boolean) {
  return renderToStaticMarkup(
    createElement(DataViewEmpty<Item>, {
      actionLabel: "Add record",
      background: createElement("div", { "data-test-background": true }),
      descriptor: { body: "Empty description", title: "Empty title" },
      reason: "true-empty",
      store: store(canManage),
      onAdd: vi.fn(),
    }),
  );
}

describe("DataViewEmpty authorization", () => {
  it("renders the existing action for an authorized true-empty view", () => {
    const html = render(true);

    expect(html).toContain("data-page-state-action");
    expect(html).toContain('data-variant="secondary"');
    expect(html).toContain("Add record");
    expect(html).toContain("<button");
  });

  it("does not render an action for a read-only true-empty view", () => {
    const html = render(false);

    expect(html).not.toContain("data-page-state-action");
    expect(html).not.toContain("Add record");
    expect(html).not.toContain("<button");
  });
});
