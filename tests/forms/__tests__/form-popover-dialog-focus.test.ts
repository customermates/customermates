// @vitest-environment jsdom

import type { Editor } from "@tiptap/react";
import type { ReactElement } from "react";
import type { Root } from "react-dom/client";

import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const form = vi.hoisted(() => ({ onChange: vi.fn(), value: undefined as unknown }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/forms/form-context", () => ({
  useAppForm: () => ({
    getError: () => undefined,
    getValue: () => form.value,
    isLoading: false,
    isReadOnly: false,
    onChange: form.onChange,
  }),
}));


vi.mock("@/components/shared/use-navigate-to-href", () => ({
  useNavigateToHref: () => vi.fn(),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ localeStore: { locale: "en" } }),
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    dateFormatMap: { descriptiveLong: (date: Date) => date.toISOString().slice(0, 10) },
    dateTimeFormatMap: { descriptiveLong: (date: Date) => date.toISOString() },
    resolvedFormattingLanguageTag: "en-US",
    use12Hour: false,
  }),
}));

vi.mock("@/hooks/use-media-query", () => ({
  useIsWiderThan: () => true,
}));

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormIsoDateRangePicker } from "@/components/forms/form-iso-date-range-picker";
import { FilterInputIsoDate } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date";
import { FilterInputIsoDateRange } from "@/components/data-view/filter-modal/inputs/filter-input-iso-date-range";
import { LinkPopover } from "@/components/editor/link-popover";

const EVENTS = [
  { value: "record.created", label: "Record created" },
  { value: "record.updated", label: "Record updated" },
  { value: "record.deleted", label: "Record deleted" },
];

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  form.value = undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  container.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function renderInDialog(field: ReactElement) {
  act(() =>
    root.render(
      createElement(
        Dialog,
        { open: true },
        createElement(
          DialogContent,
          null,
          createElement(DialogTitle, null, "Dialog"),
          createElement(DialogDescription, null, "Dialog description"),
          field,
        ),
      ),
    ),
  );
}

async function openWithKeyboardFocus(triggerId: string) {
  const trigger = document.getElementById(triggerId);
  if (!(trigger instanceof HTMLElement)) throw new Error(`Expected #${triggerId}`);

  await act(async () => {
    trigger.focus();
    trigger.click();
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function press(key: string) {
  const target = document.activeElement;
  if (!target) throw new Error("Expected a focused element");

  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
    await Promise.resolve();
  });
}

describe("form popovers inside a modal dialog", () => {
  it("moves focus into the autocomplete search box, so arrow keys and Enter pick an option", async () => {
    renderInDialog(
      createElement(FormAutocomplete<(typeof EVENTS)[number]>, {
        children: (item) => createElement("span", null, item.label),
        id: "events",
        inputId: "webhook-modal-events",
        items: EVENTS,
        label: "Events",
        renderValue: (items) => items.map((item) => createElement("span", { key: item.key }, item.data?.label)),
        selectionMode: "multiple",
      }),
    );

    await openWithKeyboardFocus("webhook-modal-events");

    expect(document.activeElement?.hasAttribute("cmdk-input")).toBe(true);

    await press("ArrowDown");
    await press("Enter");

    expect(form.onChange).toHaveBeenCalledWith("events", ["record.updated"]);
  });

  it.each([
    ["single date", () => createElement(FormIsoDatePicker, { dateOnly: true, id: "dueDate", label: "Due date" })],
    ["date range", () => createElement(FormIsoDateRangePicker, { dateOnly: true, id: "dueDate", label: "Due date" })],
    ["filter date", () => createElement(FilterInputIsoDate, { id: "dueDate", isValidFilter: true })],
    ["filter date range", () => createElement(FilterInputIsoDateRange, { id: "dueDate", isValidFilter: true })],
  ] as const)("moves focus into the %s calendar", async (_name, field) => {
    renderInDialog(field());

    await openWithKeyboardFocus("dueDate");

    const active = document.activeElement;
    expect(active?.closest("[data-slot='popover-content']")).not.toBeNull();
    expect(active?.closest("[role='grid']")).not.toBeNull();

    await press("ArrowRight");

    expect(document.activeElement).not.toBe(active);
    expect(document.activeElement?.closest("[role='grid']")).not.toBeNull();
  });

  it("moves focus into the editor link address box", async () => {
    const editor = { getAttributes: () => ({}), isActive: () => false } as unknown as Editor;
    function EditorLink() {
      const [open, setOpen] = useState(false);
      return createElement(
        "div",
        { id: "editor-toolbar" },
        createElement(LinkPopover, { editor, open, onOpenChange: setOpen }),
      );
    }
    renderInDialog(createElement(EditorLink));
    const trigger = document.querySelector("#editor-toolbar button");
    if (!(trigger instanceof HTMLElement)) throw new Error("Expected the link button");
    trigger.id = "editor-link";

    await openWithKeyboardFocus("editor-link");

    expect(document.activeElement?.getAttribute("type")).toBe("url");
  });
});
