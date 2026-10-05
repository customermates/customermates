import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { CustomColumnDto } from "@/core/data-view/column-presentation.schema";
import type { ComponentType, ReactNode } from "react";

import { CustomColumnType } from "@/core/data-view/column-presentation.types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ isTruncated: false }));

vi.mock("@/core/utils/use-is-truncated", () => ({
  useIsTruncated: () => harness.isTruncated,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-tooltip-content": true }, children),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({}),
}));
vi.mock("@/core/utils/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => vi.fn(),
}));

import { CustomFieldValue } from "@/components/data-view/custom-columns/custom-field-value";
import { AppChip } from "../app-chip";

const TestAppChip = AppChip as ComponentType<{
  children?: ReactNode;
  interactive?: boolean;
}>;

beforeEach(() => {
  harness.isTruncated = false;
});

describe("AppChip overflow tooltip accessibility", () => {
  it("shows a tooltip for a truncated plain chip without adding an implicit nested tab stop", () => {
    const fullLabel = "A deliberately long single-select option";

    const complete = renderToStaticMarkup(createElement(AppChip, null, fullLabel));

    expect(complete).not.toContain('tabindex="0"');
    expect(complete).not.toContain("data-tooltip-content");

    harness.isTruncated = true;
    const truncated = renderToStaticMarkup(createElement(AppChip, null, fullLabel));

    expect(truncated).not.toContain('tabindex="0"');
    expect(truncated).toContain(`data-tooltip-content="true">${fullLabel}</span>`);
  });

  it("does not add plain-chip keyboard semantics to interactive chips", () => {
    harness.isTruncated = true;

    const markup = renderToStaticMarkup(createElement(TestAppChip, { interactive: true }, "Truncated action"));

    expect(markup).not.toContain("tabindex=");
    expect(markup).toContain("data-tooltip-content");
  });

  it("exposes a truncated read-only single-select custom-field value to keyboard users", () => {
    harness.isTruncated = true;
    const columnId = "10000000-0000-4000-8000-000000000001";
    const optionValue = "enterprise";
    const optionLabel = "Enterprise procurement and strategic transformation";
    const column: CustomColumnDto = {
      id: columnId,
      label: "Sales pipeline",
      type: CustomColumnType.singleSelect,
      options: {
        options: [
          {
            color: "secondary",
            index: 0,
            isDefault: false,
            label: optionLabel,
            value: optionValue,
          },
        ],
      },
    };
    const item = {
      id: "20000000-0000-4000-8000-000000000001",
      customFieldValues: [{ columnId, value: optionValue }] satisfies CustomFieldValueDto[],
    };
    const ReadOnlyCustomFieldValue = CustomFieldValue as ComponentType<{
      column: CustomColumnDto;
      item: typeof item;
    }>;

    const markup = renderToStaticMarkup(createElement(ReadOnlyCustomFieldValue, { column, item }));

    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain(`data-tooltip-content="true">${optionLabel}</span>`);
  });
});
