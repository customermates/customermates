import { act, createContext, createElement, useContext, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { observer } from "mobx-react-lite";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordsStore } from "../records.store";

const guard = vi.hoisted(() => ({ use: vi.fn() }));
vi.mock("@/components/modal/use-navigation-guard", () => ({ useNavigationGuard: guard.use }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({}) }));
vi.mock("@/app/[locale]/(protected)/settings/(workspace)/actions", () => ({ getActiveUsersAction: vi.fn() }));
vi.mock("../../../actions", () => ({ getRecordChoicesAction: vi.fn() }));
vi.mock("@/components/modal/responsive-overlay", () => ({
  ResponsiveOverlay: ({ children, onOpenChange }: { children: ReactNode; onOpenChange: (open: boolean) => void }) =>
    createElement(
      "div",
      null,
      createElement("button", { "data-open": "", onClick: () => onOpenChange(true) }, "Open"),
      children,
    ),
}));
vi.mock("@/components/forms/form-autocomplete-avatar", () => ({
  FormAutocompleteAvatar: ({ items }: { items: RecordRow["assignedUsers"] }) => {
    const store = useAppForm<{ assignedUserIds: string[] }>();
    return (
      <>
        <span data-assignee-labels>{items.map((user) => user.firstName).join(", ")}</span>

        <button data-choose onClick={() => store?.onChange("assignedUserIds", [...store.form.assignedUserIds, "B"])}>
          Add B
        </button>
      </>
    );
  },
}));
vi.mock("@/components/forms/form-footer-actions", () => ({
  FormFooterActions: observer(({ store, onSave }: { store: BaseFormStore; onSave: () => void | Promise<void> }) => (
    <button
      data-save
      data-dirty={String(store.hasUnsavedChanges)}
      onClick={() => {
        void onSave();
      }}
    >
      Save
    </button>
  )),
}));

vi.mock("../record-chip", () => ({
  AddChip: ({ label }: { label: string }) => <span>{label}</span>,
  CHIP_TRIGGER_CLASS: "",
  ChipColumnIcon: () => null,
  chipPopoverClass: () => "",
  RecordPropertyChipView: () => <span>Assigned</span>,
  RecordChipList: ({
    entries,
    renderChip,
    children,
  }: {
    entries: { column: { id: string } }[];
    renderChip: (entry: unknown) => ReactNode;
    children: ReactNode;
  }) => (
    <div>
      {entries.map((entry) => (
        <span key={entry.column.id}>{renderChip(entry)}</span>
      ))}

      {children}
    </div>
  ),
}));
vi.mock("@/components/ui/dropdown-menu", () => {
  const CloseContext = createContext<() => void>(() => undefined);
  return {
    DropdownMenu: ({ children }: { children: ReactNode }) => children,
    DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
    DropdownMenuContent: ({
      children,
      onCloseAutoFocus,
    }: {
      children: ReactNode;
      onCloseAutoFocus?: (event: Event) => void;
    }) => (
      <CloseContext.Provider value={() => onCloseAutoFocus?.(new Event("closeAutoFocus"))}>
        {children}
      </CloseContext.Provider>
    ),
    DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) => {
      const close = useContext(CloseContext);
      return (
        <button
          data-add-assignees
          onClick={() => {
            onSelect();
            close();
          }}
        >
          {children}
        </button>
      );
    },
  };
});
vi.mock("@/components/ui/popover", () => {
  const OpenContext = createContext(false);
  return {
    Popover: ({ open, children }: { open: boolean; children: ReactNode }) => (
      <OpenContext.Provider value={open}>{children}</OpenContext.Provider>
    ),
    PopoverAnchor: ({ children }: { children: ReactNode }) => children,
    PopoverContent: ({ children }: { children: ReactNode }) => (useContext(OpenContext) ? children : null),
  };
});

import { useAppForm } from "@/components/forms/form-context";
import type { BaseFormStore } from "@/core/base/base-form.store";

import { RecordInlineAssignees, canEditAssignees } from "../record-inline-field";
import { RecordCardContent } from "../record-chip-row";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

it("retains the draft's original version and assignment baseline after a background refresh", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const initial = {
    id: "record",
    ref: { typeId: "type", recordId: "record" },
    version: 1,
    assignedUserIds: ["A"],
    assignedUsers: [{ id: "A", firstName: "Original", lastName: "Assignee" }],
  } as unknown as RecordRow;
  const updateRecordAssignees = vi.fn().mockResolvedValue({ saved: false });
  const records = { items: [initial], updateRecordAssignees } as unknown as RecordsStore;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const render = (record: RecordRow) =>
    act(() =>
      root?.render(
        <RecordInlineAssignees record={record} records={records}>
          Assignees
        </RecordInlineAssignees>,
      ),
    );
  render(initial);
  act(() => host?.querySelector<HTMLButtonElement>("[data-open]")?.click());
  act(() => host?.querySelector<HTMLButtonElement>("[data-choose]")?.click());

  const refreshed = { ...initial, version: 2, assignedUserIds: ["B"], assignedUsers: [] };
  records.items = [refreshed];
  render(refreshed);
  expect(host.querySelector("[data-save]")?.getAttribute("data-dirty")).toBe("true");
  expect(host.querySelector("[data-assignee-labels]")?.textContent).toBe("Original");
  expect(guard.use).toHaveBeenCalledWith(expect.objectContaining({ hasUnsavedChanges: true }));
  await act(async () => {
    host?.querySelector<HTMLButtonElement>("[data-save]")?.click();
    await vi.waitFor(() => expect(updateRecordAssignees).toHaveBeenCalledOnce());
  });

  expect(updateRecordAssignees).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ version: 1, assignedUserIds: ["A"] }),
    ["A", "B"],
  );
  expect(host.querySelector("[data-save]")?.getAttribute("data-dirty")).toBe("true");
});

it("keeps assignee editing disabled for embedded lists and records without update permission", () => {
  const record = {} as RecordRow;
  const writable = { type: { embedded: false }, canUpdateRecord: () => true } as unknown as RecordsStore;
  expect(canEditAssignees(writable, record)).toBe(true);
  expect(canEditAssignees({ ...writable, type: { embedded: true } } as unknown as RecordsStore, record)).toBe(false);
  expect(canEditAssignees({ ...writable, canUpdateRecord: () => false } as unknown as RecordsStore, record)).toBe(
    false,
  );
});

it.each([true, false])(
  "preserves an assignee draft when the chip changes from filled=%s during refresh",
  async (filled) => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const initial = {
      id: "record",
      ref: { typeId: "type", recordId: "record" },
      version: 1,
      assignedUserIds: filled ? ["A"] : [],
      assignedUsers: filled ? [{ id: "A", firstName: "A" }] : [],
      fields: [],
      relationships: [],
    } as unknown as RecordRow;
    const column = { id: "system:assignedTo", kind: "system", label: "Assigned to", sortable: false };
    const updateRecordAssignees = vi.fn().mockResolvedValue({ saved: false });
    const records = {
      items: [initial],
      updateRecordAssignees,
      canUpdateRecord: () => true,
      recordColumns: [column],
      visibleColumns: [{ uid: column.id }],
      presentation: { linkIcons: {}, model: { types: [] } },
    } as unknown as RecordsStore;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const render = (record: RecordRow) =>
      act(() =>
        root?.render(
          <RecordCardContent record={record} records={records} title="Record" onOpenRecord={() => undefined} />,
        ),
      );
    render(initial);
    act(() => host?.querySelector<HTMLButtonElement>(filled ? "[data-open]" : "[data-add-assignees]")?.click());
    act(() => host?.querySelector<HTMLButtonElement>("[data-choose]")?.click());
    const refreshed = {
      ...initial,
      version: 2,
      assignedUserIds: filled ? [] : ["A"],
      assignedUsers: filled ? [] : [{ id: "A", firstName: "A" }],
    } as RecordRow;
    records.items = [refreshed];
    render(refreshed);
    expect(host.querySelector("[data-save]")?.getAttribute("data-dirty")).toBe("true");
    await act(async () => {
      host?.querySelector<HTMLButtonElement>("[data-save]")?.click();
      await vi.waitFor(() => expect(updateRecordAssignees).toHaveBeenCalledOnce());
    });
    expect(updateRecordAssignees).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ version: 1, assignedUserIds: filled ? ["A"] : [] }),
      filled ? ["A", "B"] : ["B"],
    );
  },
);
