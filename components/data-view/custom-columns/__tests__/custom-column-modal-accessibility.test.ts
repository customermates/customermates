import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  form: {
    id: "00000000-0000-4000-8000-000000000001",
    label: "Stage",
    type: "singleSelect",
    entityType: "deal",
    options: {
      options: [
        { value: "open", label: "Open", color: "secondary", isDefault: true, index: 0, weight: 20 },
        { value: "won", label: "Won", color: "success", isDefault: false, index: 1, weight: 100 },
        { value: "draft", label: "", color: "secondary", isDefault: false, index: 2, weight: 0 },
      ],
    },
  },
  canDeleteOption: true,
  clearPendingFocusOptionValue: vi.fn(),
  hasUnsavedChanges: false,
  isDealWeightingColumn: true,
  isDeleteColumnDisabled: false,
  isDisabled: false,
  isLoading: false,
  isOptionWeightReadOnly: false,
  isTypeLocked: false,
  onChange: vi.fn(),
  addOption: vi.fn(),
  deleteOption: vi.fn(),
  toggleDefaultOption: vi.fn(),
  reorderOptions: vi.fn(),
}));

const { passthrough } = vi.hoisted(() => ({
  passthrough: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { number?: number }) =>
    values?.number === undefined ? key : `${key}:${values.number}`,
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: passthrough,
  KeyboardSensor: {},
  PointerSensor: {},
  useSensor: () => ({}),
  useSensors: () => [],
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: passthrough,
  sortableKeyboardCoordinates: () => undefined,
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => undefined, transform: null }),
  verticalListSortingStrategy: () => null,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ customColumnModalStore: store }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ dateFormatMap: {}, dateTimeFormatMap: {} }),
}));
vi.mock("@/components/modal", () => ({
  AppModal: ({ actions = [], children }: { actions?: Array<{ id: string; tooltip?: string }>; children?: ReactNode }) =>
    createElement(
      "div",
      null,
      ...actions.map((action) =>
        createElement("span", { key: action.id, "data-action-id": action.id, "data-action-tooltip": action.tooltip }),
      ),
      children,
    ),
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn() }),
}));
vi.mock("@/components/forms/form-context", () => ({ AppForm: passthrough }));
vi.mock("@/components/forms/form-autocomplete-currency", () => ({ FormAutocompleteCurrency: () => null }));
vi.mock("@/components/forms/form-field-help", () => ({ FormFieldHelp: () => null }));
vi.mock("@/components/forms/form-input", () => ({
  FormInput: ({ id, "aria-label": ariaLabel }: { id: string; "aria-label"?: string }) =>
    createElement("input", { "aria-label": ariaLabel, "data-label-id": id }),
}));
vi.mock("@/components/forms/form-select", () => ({ FormSelect: () => null }));
vi.mock("@/components/forms/form-switch", () => ({ FormSwitch: () => null }));
vi.mock("@/components/forms/form-number-input", () => ({
  FormNumberInput: ({ id, "aria-label": ariaLabel }: { id: string; "aria-label"?: string }) =>
    createElement("input", { "aria-label": ariaLabel, "data-weight-id": id }),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: passthrough,
  TooltipContent: () => null,
  TooltipTrigger: passthrough,
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: passthrough,
  DropdownMenuContent: () => null,
  DropdownMenuRadioGroup: passthrough,
  DropdownMenuRadioItem: passthrough,
  DropdownMenuTrigger: passthrough,
}));

import { CustomColumnModal } from "../custom-column-modal";

function optionNameLabels(markup: string): Record<string, string> {
  return Object.fromEntries(
    [...markup.matchAll(/<input aria-label="([^"]*)" data-label-id="([^"]*)"/g)].map(([, label, id]) => [id, label]),
  );
}

function weightLabels(markup: string): Record<string, string> {
  return Object.fromEntries(
    [...markup.matchAll(/<input aria-label="([^"]*)" data-weight-id="([^"]*)"/g)].map(([, label, id]) => [id, label]),
  );
}

describe("CustomColumnModal stage probability inputs", () => {
  it("names each probability input after its stage, like My Company settings", () => {
    const markup = renderToStaticMarkup(createElement(CustomColumnModal));

    expect(weightLabels(markup)).toEqual({
      "options.options[0].weight": "Open",
      "options.options[1].weight": "Won",
      "options.options[2].weight": "Common.probability",
    });
  });
});

describe("CustomColumnModal option name inputs", () => {
  it("names each option's text field by its position, since the Name header is not its label", () => {
    const markup = renderToStaticMarkup(createElement(CustomColumnModal));

    expect(optionNameLabels(markup)).toEqual({
      "options.options[0].label": "Common.ariaLabels.optionName:1",
      "options.options[1].label": "Common.ariaLabels.optionName:2",
      "options.options[2].label": "Common.ariaLabels.optionName:3",
    });
  });
});

describe("CustomColumnModal delete action on the deal weighting column", () => {
  afterEach(() => {
    store.isDeleteColumnDisabled = false;
    store.isDisabled = false;
  });

  function deleteTooltip(): string | undefined {
    const markup = renderToStaticMarkup(createElement(CustomColumnModal));
    const match = /data-action-id="delete-custom-field"(?: data-action-tooltip="([^"]*)")?/.exec(markup);
    if (!match) throw new Error(`Expected the delete action in ${markup}`);
    return match[1];
  }

  it("explains why deleting the weighting column is disabled without company update permission", () => {
    store.isDeleteColumnDisabled = true;

    expect(deleteTooltip()).toBe("Common.customFieldHelp.deleteWeightingColumnPermission");
  });

  it("keeps the plain label when the whole dialog is read-only", () => {
    store.isDeleteColumnDisabled = true;
    store.isDisabled = true;

    expect(deleteTooltip()).toBeUndefined();
  });

  it("keeps the plain label while deleting is allowed", () => {
    expect(deleteTooltip()).toBeUndefined();
  });
});
