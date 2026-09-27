import type { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { DataViewPagination } from "../pagination";

type Item = { id: string };

describe("DataViewPagination page size", () => {
  it("names the page-size picker, which shows only a number", () => {
    const store = {
      pagination: { page: 1, pageSize: 25, total: 60, totalPages: 3 },
      setQueryOptions: vi.fn(),
    } as unknown as BaseDataViewStore<Item>;

    const markup = renderToStaticMarkup(createElement(DataViewPagination<Item>, { store }));
    const combobox = markup.split("<button").find((button) => button.includes('role="combobox"'));

    expect(combobox).toContain('aria-label="Common.table.rowsPerPage"');
  });
});
