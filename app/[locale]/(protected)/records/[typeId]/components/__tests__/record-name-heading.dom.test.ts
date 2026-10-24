import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecordEditorStore } from "../record-editor.store";

const tooltip = vi.hoisted(() => ({ onOpenChange: null as ((open: boolean) => void) | null }));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/utils/background-task.service", () => ({}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: ReactNode;
  }) => {
    tooltip.onOpenChange = onOpenChange ?? null;
    return createElement("div", { "data-tooltip-open": String(Boolean(open)) }, children);
  },
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-tooltip-content": "" }, children),
}));
vi.mock("@/components/forms/form-input", () => ({
  FormInput: ({ id, "aria-label": label }: { id: string; "aria-label": string }) =>
    createElement("input", { "aria-label": label, "data-form-id": id, readOnly: true, value: NAME }),
}));

import { RecordNameHeading } from "../record-editor-fields";

const NAME = "Sonnenhof Fire and Safety - Enterprise 242 - New";
const FIELD = "10000000-0000-4000-8000-000000000001";

function store() {
  return {
    presentation: {
      typeId: "deal",
      model: {
        types: [{ id: "deal", primaryFieldId: FIELD }],
        fields: [
          { id: FIELD, label: "Name", archived: false, required: true, valueType: "text", behavior: { kind: "input" } },
        ],
      },
    },
    record: { fields: [{ fieldId: FIELD, result: { state: "value", value: { kind: "text", value: NAME } } }] },
    getValue: (id: string) => (id === `values.${FIELD}` ? NAME : undefined),
  } as unknown as RecordEditorStore;
}

const roots = new Set<Root>();
function render() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);
  act(() => root.render(createElement(RecordNameHeading, { store: store(), name: NAME, placeholder: "New deal" })));
  return host;
}

function size(input: HTMLInputElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(input, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(input, "clientWidth", { configurable: true, value: clientWidth });
}

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.replaceChildren();
  tooltip.onOpenChange = null;
});

describe("record name heading", () => {
  it("ends a long name with an ellipsis at rest and clips it only while editing", () => {
    const host = render();
    const heading = host.querySelector<HTMLElement>(`[data-record-name-heading="${FIELD}"]`);
    expect(heading?.getAttribute("role")).toBe("heading");
    expect(heading?.className).toContain("[&_input]:text-ellipsis");
    expect(heading?.className).toContain("[&_input]:focus:text-clip");
    expect(heading?.querySelector("input")?.hasAttribute("title")).toBe(false);
  });

  it("shows the full name in the tooltip only when it is truncated and not being edited", () => {
    const host = render();
    const input = host.querySelector("input");
    if (!input) throw new Error("Expected the name input");
    const open = () => host.querySelector("[data-tooltip-open]")?.getAttribute("data-tooltip-open");
    expect(host.querySelector("[data-tooltip-content]")?.textContent).toBe(NAME);

    size(input, 200, 200);
    act(() => tooltip.onOpenChange?.(true));
    expect(open()).toBe("false");

    size(input, 600, 200);
    act(() => tooltip.onOpenChange?.(true));
    expect(open()).toBe("true");
    act(() => tooltip.onOpenChange?.(false));
    expect(open()).toBe("false");

    act(() => tooltip.onOpenChange?.(true));
    expect(open()).toBe("true");
    act(() => input.focus());
    expect(open()).toBe("false");
    act(() => tooltip.onOpenChange?.(true));
    expect(open()).toBe("false");
  });
});
