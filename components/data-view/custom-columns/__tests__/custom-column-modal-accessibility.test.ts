import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
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
vi.mock("@/components/modal", () => ({ AppModal: passthrough }));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn() }),
}));
vi.mock("@/components/forms/form-context", () => ({ AppForm: passthrough }));
vi.mock("@/components/forms/form-autocomplete-currency", () => ({ FormAutocompleteCurrency: () => null }));
vi.mock("@/components/forms/form-field-help", () => ({ FormFieldHelp: () => null }));
vi.mock("@/components/forms/form-input", () => ({ FormInput: () => null }));
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
