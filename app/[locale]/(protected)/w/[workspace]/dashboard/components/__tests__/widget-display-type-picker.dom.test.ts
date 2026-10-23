import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DisplayType } from "@/features/widget/widget.schema";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { WidgetDisplayTypePicker } from "../widget-display-type-picker";

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("widget display type picker", () => {
  it("offers every display type and disables the ones the configuration cannot use with a hint", () => {
    const onValueChange = vi.fn();
    act(() =>
      root.render(
        createElement(WidgetDisplayTypePicker, {
          value: DisplayType.verticalBarChart,
          unavailable: { [DisplayType.number]: "noGrouping", [DisplayType.funnelChart]: "singleChoice" },
          onValueChange,
        }),
      ),
    );
    for (const type of Object.values(DisplayType)) {
      const input = container.querySelector<HTMLButtonElement>(`[id="display-type-${type}"]`);
      expect(input, type).not.toBeNull();
      expect(input?.disabled, type).toBe(type === DisplayType.number || type === DisplayType.funnelChart);
    }
    const label = (type: DisplayType) => container.querySelector(`label[for="display-type-${type}"]`)?.textContent;
    expect(label(DisplayType.number)).toBe("Dashboard.displayTypes.numberDashboard.displayTypeRequirements.noGrouping");
    expect(label(DisplayType.funnelChart)).toBe(
      "Dashboard.displayTypes.funnelChartDashboard.displayTypeRequirements.singleChoice",
    );
    expect(label(DisplayType.areaChart)).toBe("Dashboard.displayTypes.areaChart");
    act(() => container.querySelector<HTMLButtonElement>('[id="display-type-areaChart"]')?.click());
    expect(onValueChange).toHaveBeenCalledWith(DisplayType.areaChart);
    act(() => container.querySelector<HTMLButtonElement>('[id="display-type-number"]')?.click());
    expect(onValueChange).not.toHaveBeenCalledWith(DisplayType.number);
    for (const type of [DisplayType.number, DisplayType.areaChart, DisplayType.rankedTable, DisplayType.funnelChart])
      expect(container.querySelector(`label[for="display-type-${type}"] > div`), type).not.toBeNull();
  });
});
