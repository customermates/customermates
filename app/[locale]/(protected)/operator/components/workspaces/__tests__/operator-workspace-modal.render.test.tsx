import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  showConfirmation: vi.fn(),
  updateEnterpriseFileStorage: vi.fn(() => Promise.resolve(true)),
  passThrough: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatNumber: (value: number) => String(value),
    formatNumericalShortDateTime: () => "",
    formatMonthYear: () => "",
  }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    operatorWorkspacesStore: {
      updateTags: vi.fn(() => Promise.resolve(true)),
      updateSubscriptionTerms: vi.fn(() => Promise.resolve(true)),
      updateEnterpriseAllowance: vi.fn(() => Promise.resolve(true)),
      updateEnterpriseFileStorage: harness.updateEnterpriseFileStorage,
      correctSubscription: vi.fn(),
      deleteWorkspace: vi.fn(),
    },
  }),
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showConfirmation: harness.showConfirmation }),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("../../use-operator-chip-options", () => ({
  useOperatorChipOptions: () => ({ plan: [], subscription: [] }),
}));
vi.mock("../../operator-chip-select", () => ({ OperatorChipSelect: () => null }));
vi.mock("../../../workspaces/actions", () => ({ getOperatorWorkspaceStatsAction: () => new Promise(() => {}) }));
vi.mock("../../../actions", () => ({ getOperatorWorkspaceTagsAction: () => new Promise(() => {}) }));
vi.mock("@/components/modal", () => ({ AppModal: harness.passThrough }));
vi.mock("@/components/modal/confirm-dialog", () => ({ ConfirmDialog: () => null }));
vi.mock("@/components/forms/form-footer-actions", () => ({
  FormFooterActions: ({ dirty, onSave }: { dirty: boolean; onSave: () => void }) => (
    <button disabled={!dirty} id="operator-modal-save" type="button" onClick={onSave}>
      save
    </button>
  ),
}));
vi.mock("@/components/card/app-card", () => ({ AppCard: harness.passThrough }));
vi.mock("@/components/card/app-card-body", () => ({ AppCardBody: harness.passThrough }));
vi.mock("@/components/card/app-card-header", () => ({ AppCardHeader: harness.passThrough }));
vi.mock("@/components/chip/app-chip", () => ({ AppChip: harness.passThrough }));
vi.mock("@/components/chip/clickable-chip", () => ({ ClickableChip: harness.passThrough }));
vi.mock("@/components/shared/info-row", () => ({ InfoRow: harness.passThrough }));
vi.mock("@/components/forms/form-input-chips", () => ({ FormInputChips: () => null }));
vi.mock("@/components/forms/form-iso-date-picker", () => ({ FormIsoDatePicker: () => null }));
vi.mock("@/components/forms/form-label", () => ({ FormLabel: harness.passThrough }));
vi.mock("@/components/forms/form-number-input", () => ({
  FormNumberInput: ({
    id,
    value,
    onValueChange,
  }: {
    id: string;
    value?: number;
    onValueChange: (value: number | undefined) => void;
  }) => (
    <input
      id={id}
      value={value ?? ""}
      onChange={(event) => onValueChange(event.target.value ? Number(event.target.value) : undefined)}
    />
  ),
}));
vi.mock("@/components/ui/input", () => ({ Input: () => null }));
vi.mock("@/components/ui/select", () => ({
  Select: harness.passThrough,
  SelectContent: harness.passThrough,
  SelectItem: harness.passThrough,
  SelectTrigger: harness.passThrough,
  SelectValue: () => null,
}));
vi.mock("@/components/ui/separator", () => ({ Separator: () => null }));
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: () => null }));

import { OperatorWorkspaceModal } from "../operator-workspace-modal";

const GIB = 1024 ** 3;
const WORKSPACE: OperatorWorkspaceRowDto = {
  id: "00000000-0000-4000-8000-000000000001",
  workspaceLabel: "acme.test",
  ownerEmail: "owner@acme.test",
  ownerUserId: "00000000-0000-4000-8000-000000000002",
  userCount: 3,
  activeUserCount: 3,
  plan: "enterprise",
  subscriptionStatus: "active",
  seats: 3,
  enterpriseCreditsPerUser: 100,
  enterpriseFileStorageBytesPerUser: 5 * GIB,
  creditsPerUser: 100,
  trialEndDate: null,
  lemonSqueezyId: null,
  subscriptionUpdatedAt: new Date("2026-10-01T00:00:00.000Z"),
  adProvider: null,
  tags: [],
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
};

let container: HTMLDivElement;
let root: Root;

function input(id: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!element) throw new Error(`Missing input ${id}`);
  return element;
}

function type(id: string, value: string) {
  const element = input(id);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function save(): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>("#operator-modal-save");
  if (!element) throw new Error("Missing save button");
  return element;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.showConfirmation.mockReset();
  harness.updateEnterpriseFileStorage.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<OperatorWorkspaceModal workspace={WORKSPACE} onClose={() => {}} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("OperatorWorkspaceModal", () => {
  it("saves a change of only the file storage of an Enterprise workspace", async () => {
    expect(input("operator-modal-file-storage").value).toBe("5");
    expect(save().disabled).toBe(true);

    type("operator-modal-file-storage", "8");
    expect(save().disabled).toBe(false);

    act(() => save().click());
    expect(harness.showConfirmation).toHaveBeenCalledTimes(1);
    const [confirmation] = harness.showConfirmation.mock.calls[0] as [
      { message: string; onConfirm: () => Promise<boolean> },
    ];
    expect(confirmation.message).toBe("OperatorConsole.confirm.fileStorage");
    expect(await confirmation.onConfirm()).toBe(true);
    expect(harness.updateEnterpriseFileStorage).toHaveBeenCalledWith({ companyId: WORKSPACE.id, gigabytesPerUser: 8 });

    type("operator-modal-file-storage", "5");
    expect(save().disabled).toBe(true);
  });
});
