import type { RootStore } from "@/core/stores/root.store";
import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { EmailSettings } from "@/ee/messaging/email-settings";
import type { ReactElement, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { action, observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";
import {
  defaultEmailSettings,
  SignatureDivider,
  SignatureLogoSize,
  SignatureSpacing,
  SignatureTemplate,
} from "@/ee/messaging/email-settings";

const harness = vi.hoisted(() => ({
  rootStore: null as Record<string, unknown> | null,
  saveAction: vi.fn(),
  upsertItem: vi.fn(),
}));

vi.mock("../../connected-accounts/actions", () => ({
  setConnectedAccountSignatureAction: harness.saveAction,
}));
vi.mock("@/components/modal/use-navigation-guard", () => ({
  useNavigationGuard: vi.fn(),
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: (value: string) => value }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/editor/email-markdown-editor", () => ({
  EmailMarkdownEditor: ({
    ariaLabel,
    disabled,
    id,
    invalid,
    onChange,
    value,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    id: string;
    invalid?: boolean;
    onChange: (value: string) => void;
    value: string;
  }) =>
    createElement("textarea", {
      "aria-label": ariaLabel,
      "aria-invalid": Boolean(invalid),
      disabled,
      id,
      value,
      onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value),
    }),
}));

vi.mock("@/features/messaging/email-frame", () => ({
  EmailFrame: ({ html }: { html: string }) => createElement("div", { "data-email-preview": html }),
}));

vi.mock("@/ee/messaging/outbound/email-signature", () => ({
  composeEmailBodies: () => ({ html: "<p>Preview</p>", text: "Preview" }),
}));

vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: vi.fn(),
  runUserAction: (action: () => unknown) => action(),
}));

vi.mock("../signature-template-picker", () => ({
  SignatureTemplatePicker: ({
    disabled,
    onValueChange,
    value,
  }: {
    disabled?: boolean;
    onValueChange: (value: SignatureTemplate) => void;
    value: SignatureTemplate;
  }) =>
    createElement(
      "select",
      {
        "aria-label": "signature-template",
        disabled,
        value,
        onChange: (event: { currentTarget: { value: SignatureTemplate } }) => onValueChange(event.currentTarget.value),
      },
      Object.values(SignatureTemplate).map((template) =>
        createElement("option", { key: template, value: template }, template),
      ),
    ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    disabled,
    id,
    onCheckedChange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    id?: string;
    onCheckedChange?: (checked: boolean) => void;
  }) =>
    createElement("input", {
      checked,
      disabled,
      id,
      role: "switch",
      type: "checkbox",
      onChange: (event: { currentTarget: { checked: boolean } }) => onCheckedChange?.(event.currentTarget.checked),
    }),
}));

vi.mock("@/components/modal", () => ({
  AppModal: ({ children, size }: { children: ReactNode; size: string }) =>
    createElement("div", { "data-modal-size": size }, children),
}));

vi.mock("@/components/card/app-card", () => ({
  AppCard: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

vi.mock("@/components/card/app-card-body", () => ({
  AppCardBody: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

vi.mock("@/components/card/app-card-header", () => ({
  AppCardHeader: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));

vi.mock("@/components/shared/avatar-stack", () => ({
  AvatarStack: () => createElement("div", { "data-avatar-stack": true }),
}));

vi.mock("@/components/shared/info-row", () => ({
  InfoRow: ({ children, label }: { children: ReactNode; label: ReactNode }) =>
    createElement("div", null, label, children),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  TooltipContent: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => harness.rootStore,
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatNumericalShortDateTime: () => "date",
    formatNumber: String,
    formatNumberForEditing: (value?: number) => (value == null ? "" : String(value)),
    parseNumber: (value: string) => (value.trim() ? Number(value) : undefined),
  }),
}));

vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn() }),
}));

vi.mock("@/ee/messaging/provider-icon", () => ({
  getProviderIcon: () => (props: Record<string, unknown>) => createElement("span", props),
}));

vi.mock("@/ee/subscription/entitlements", () => ({
  getEffectiveEntitlements: () => ({ sharedAccounts: true }),
}));

vi.mock("../account-status-color", () => ({
  accountStatusChipColor: () => "success",
  getProviderDisplayLabel: () => "Provider",
}));

vi.mock("../account-folders", () => ({
  AccountFolders: () => createElement("div", { "data-account-folders": true }),
}));

import { AccountSignature } from "../account-signature";
import { ConnectedAccountModal } from "../connected-account-modal";
import { ConnectedAccountModalStore } from "../connected-account-modal.store";

const roots = new Set<Root>();
const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);
  act(() => root.render(element));
  return container;
}

function requiredElement<ElementType extends Element>(element: ElementType | null): ElementType {
  if (!element) throw new Error("Expected element to exist");
  return element;
}

function setValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set?.bind(element);
  if (!setter) throw new Error("Expected the element value setter");

  act(() => {
    setter(value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    element.click();
    await Promise.resolve();
  });
}

async function chooseOption(container: HTMLElement, id: string, label: string) {
  const trigger = requiredElement(container.querySelector<HTMLButtonElement>(`[id="${id}"]`));
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await Promise.resolve();
  });
  const option = requiredElement(
    [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent === label) ?? null,
  );
  await click(option);
}

function modalStore(account: ConnectedAccountDto) {
  const rootStore = {
    appMode: "cloud",
    registerModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
    connectedAccountsStore: {
      disconnect: vi.fn(),
      reconnect: vi.fn(),
      resync: vi.fn(),
      upsertItem: harness.upsertItem,
      setVisibility: vi.fn((_id: string, shared: boolean) =>
        Promise.resolve({
          ...account,
          shared,
        }),
      ),
      setSelectedFolders: vi.fn((_id: string, selectedFolderIds: string[]) =>
        Promise.resolve({
          ...account,
          selectedFolderIds,
        }),
      ),
    },
    subscriptionStore: { subscription: { plan: "pro" } },
    userModalStore: { loadById: vi.fn() },
    userStore: { can: () => true },
  };
  const store = new ConnectedAccountModalStore(rootStore as unknown as RootStore);
  harness.rootStore = Object.assign(rootStore, {
    connectedAccountModalStore: store,
  });
  store.openWith(account);
  return store;
}

function expectActiveTab(container: HTMLElement, tab: string, size: string) {
  expect(container.querySelector(`#connected-account-tab-${tab}`)?.getAttribute("aria-selected")).toBe("true");
  expect(container.querySelector("[data-modal-size]")?.getAttribute("data-modal-size")).toBe(size);
  expect(container.querySelectorAll('[role="tab"][aria-selected="true"]')).toHaveLength(1);
}

function emailAccount(settings: EmailSettings = defaultEmailSettings()): ConnectedAccountDto {
  return {
    id: "03f07663-3ddb-4b33-bf31-6b00f25a5194",
    displayName: "Inbox",
    provider: MessagingProvider.google,
    status: ConnectedAccountStatus.ok,
    syncing: false,
    shared: false,
    hasMessaging: true,
    hasCalendar: false,
    signature: "",
    emailSettings: settings,
    signatureHtml: null,
    emailAddress: "inbox@example.com",
    isOwner: true,
    folders: [],
    selectedFolderIds: [],
    foldersSyncedAt: null,
    linkedinProducts: [],
    owner: {
      userId: "3d788d03-eb75-4d99-89cc-bc13c7850e4b",
      firstName: "Ava",
      lastName: "Miller",
      avatarUrl: null,
    },
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    lastSyncedAt: null,
  };
}

function saveButton(container: HTMLElement) {
  return requiredElement(
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "ConnectedAccountsCard.emailSave",
    ) ?? null,
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  harness.rootStore = null;
  harness.saveAction.mockImplementation((id: string, signature: string, settings: EmailSettings) =>
    Promise.resolve({
      ok: true,
      data: { ...emailAccount(settings), id, signature: signature.trim() },
    }),
  );
  harness.upsertItem.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
  if (scrollIntoViewDescriptor)
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoViewDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.clearAllMocks();
});

function field<ElementType extends HTMLElement>(container: HTMLElement, id: string): ElementType {
  return requiredElement(container.querySelector<ElementType>('[id="' + id + '"]'));
}

function mountSignature(settings = defaultEmailSettings()) {
  const account = emailAccount(settings);
  const modal = modalStore(account);
  const store = modal.signatureStore;
  const container = mount(createElement(AccountSignature, { account: modal.form, store }));
  return { container, store, modal };
}

describe("AccountSignature shared form", () => {
  it("saves layout, Markdown and appearance through the shared form store", async () => {
    const settings = defaultEmailSettings();
    settings.signature = {
      ...settings.signature,
      enabled: true,
      template: SignatureTemplate.sideBySide,
      logoUrl: "https://cdn.example.com/logo.png",
    };
    const { container, store, modal } = mountSignature(settings);
    setValue(field<HTMLTextAreaElement>(container, "signature"), "**Custom signature**");
    await click(requiredElement(container.querySelector("summary")));
    await chooseOption(container, "settings.signature.logoSize", "ConnectedAccountsCard.emailLogoSizes.large");
    await chooseOption(container, "settings.signature.divider", "ConnectedAccountsCard.emailDividers.line");
    await chooseOption(container, "settings.signature.spacing", "ConnectedAccountsCard.emailSpacings.compact");
    expect(store.hasUnsavedChanges).toBe(true);
    expect(modal.hasUnsavedChanges).toBe(true);
    await click(saveButton(container));
    expect(harness.saveAction).toHaveBeenCalledWith(modal.form.id, "**Custom signature**", {
      ...settings,
      signature: {
        ...settings.signature,
        logoSize: SignatureLogoSize.large,
        divider: SignatureDivider.line,
        spacing: SignatureSpacing.compact,
      },
    });
    expect(harness.upsertItem).toHaveBeenCalledOnce();
    expect(store.hasUnsavedChanges).toBe(false);
    expect(modal.hasUnsavedChanges).toBe(false);
    expect(saveButton(container).disabled).toBe(true);
  });

  it("retains layout choices and Markdown while switching to plain or disabling the signature", async () => {
    const settings = defaultEmailSettings();
    settings.signature = {
      ...settings.signature,
      enabled: true,
      template: SignatureTemplate.sideBySide,
      logoUrl: "https://cdn.example.com/logo.png",
      logoSize: SignatureLogoSize.large,
      divider: SignatureDivider.line,
      spacing: SignatureSpacing.compact,
    };
    const { container, store } = mountSignature(settings);
    setValue(field<HTMLTextAreaElement>(container, "signature"), "Retained");
    setValue(
      requiredElement(container.querySelector<HTMLSelectElement>('[aria-label="signature-template"]')),
      SignatureTemplate.plain,
    );
    expect(container.querySelector('[id="settings.signature.logoUrl"]')).toBeNull();
    await click(field(container, "settings.signature.enabled"));
    expect(container.querySelector("#signature")).toBeNull();
    await click(saveButton(container));
    expect(store.form.signature).toBe("Retained");
    expect(store.form.settings.signature).toMatchObject({
      ...settings.signature,
      enabled: false,
      template: SignatureTemplate.plain,
    });
    await click(field(container, "settings.signature.enabled"));
    expect(field<HTMLTextAreaElement>(container, "signature").value).toBe("Retained");
    setValue(
      requiredElement(container.querySelector<HTMLSelectElement>('[aria-label="signature-template"]')),
      SignatureTemplate.sideBySide,
    );
    expect(field(container, "settings.signature.logoSize").textContent).toBe(
      "ConnectedAccountsCard.emailLogoSizes.large",
    );
    expect(field(container, "settings.signature.divider").textContent).toBe("ConnectedAccountsCard.emailDividers.line");
    expect(field(container, "settings.signature.spacing").textContent).toBe(
      "ConnectedAccountsCard.emailSpacings.compact",
    );
  });

  it("keeps custom hex validation, the native picker and advisory low-contrast feedback", async () => {
    const { container } = mountSignature();
    const hex = field<HTMLInputElement>(container, "settings.appearance.linkHex");
    const picker = requiredElement(container.querySelector<HTMLInputElement>('input[type="color"]'));
    for (const invalid of ["", "#abc", "123456", "#gg0000"]) {
      setValue(hex, invalid);
      expect(hex.getAttribute("aria-invalid")).toBe("true");
      expect(container.querySelector("#email-linkHex-error")).not.toBeNull();
    }
    setValue(hex, "#Ab12Cd");
    expect(picker.value).toBe("#ab12cd");
    setValue(picker, "#ffffff");
    expect(hex.value).toBe("#ffffff");
    expect(container.querySelector("#email-linkHex-contrast")).not.toBeNull();
    await click(saveButton(container));
    expect(harness.saveAction).toHaveBeenCalledWith(
      expect.any(String),
      "",
      expect.objectContaining({
        appearance: expect.objectContaining({ linkHex: "#ffffff" }),
      }),
    );
  });

  it.each([
    {
      id: "settings.appearance.fontSize",
      tree: {
        settings: {
          properties: {
            appearance: {
              properties: {
                fontSize: { errors: ["Enter a whole number from 10 to 20."] },
              },
            },
          },
        },
      },
      message: "Enter a whole number from 10 to 20.",
    },
    {
      id: "settings.signature.logoUrl",
      tree: {
        settings: {
          properties: {
            signature: {
              properties: {
                logoUrl: { errors: ["Enter a public HTTPS URL."] },
              },
            },
          },
        },
      },
      message: "Enter a public HTTPS URL.",
    },
    {
      id: "signature",
      tree: { signature: { errors: ["Use at most 2,000 characters."] } },
      message: "Use at most 2,000 characters.",
    },
  ])("renders the validated server error for $id without losing the draft", async ({ id, tree, message }) => {
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    const { container, store } = mountSignature(settings);
    setValue(field<HTMLTextAreaElement>(container, "signature"), "Unsaved content");
    harness.saveAction.mockResolvedValue({
      ok: false,
      error: { errors: [], properties: tree },
    });
    await click(saveButton(container));
    expect(field(container, id + "-error").textContent).toBe(message);
    expect(field(container, id).getAttribute("aria-invalid")).toBe("true");
    expect(store.form.signature).toBe("Unsaved content");
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.isLoading).toBe(false);
    expect(harness.upsertItem).not.toHaveBeenCalled();
  });

  it("locks the complete form while saving and adopts normalized server values", async () => {
    let finish: ((value: unknown) => void) | undefined;
    harness.saveAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { container, store, modal } = mountSignature();
    const fontSize = field<HTMLInputElement>(container, "settings.appearance.fontSize");
    setValue(fontSize, "14");
    await click(saveButton(container));
    expect(store.isLoading).toBe(true);
    expect(fontSize.disabled).toBe(true);
    expect(saveButton(container).disabled).toBe(true);
    await act(async () => {
      finish?.({
        ok: true,
        data: {
          ...modal.form,
          emailSettings: {
            ...store.form.settings,
            appearance: { ...store.form.settings.appearance, fontSize: 14 },
          },
        },
      });
      await Promise.resolve();
    });
    expect(store.isLoading).toBe(false);
    expect(store.hasUnsavedChanges).toBe(false);
  });
});

describe("ConnectedAccountModal email form lifecycle", () => {
  it("keeps unsaved nested settings separate from connected-account presentation", () => {
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    const originalColour = settings.appearance.linkHex;
    const { store, modal } = mountSignature(settings);
    act(() => store.onChange("settings.appearance.linkHex", "#123456"));
    expect(store.form.settings.appearance.linkHex).toBe("#123456");
    expect(modal.form.emailSettings.appearance.linkHex).toBe(originalColour);
    expect(settings.appearance.linkHex).toBe(originalColour);
    expect(store.savedState.settings.appearance.linkHex).toBe(originalColour);
    expect(store.hasUnsavedChanges).toBe(true);
  });

  it("preserves the complete dirty form when a responsive overlay remounts its content", () => {
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    const { container, store, modal } = mountSignature(settings);
    setValue(field<HTMLTextAreaElement>(container, "signature"), "Unsaved responsive signature");
    setValue(field<HTMLInputElement>(container, "settings.appearance.linkHex"), "#123456");
    const root = [...roots].at(-1);
    if (!root) throw new Error("Expected a mounted root");
    act(() => root.unmount());
    roots.delete(root);
    const remounted = mount(createElement(AccountSignature, { account: modal.form, store }));
    expect(field<HTMLTextAreaElement>(remounted, "signature").value).toBe("Unsaved responsive signature");
    expect(field<HTMLInputElement>(remounted, "settings.appearance.linkHex").value).toBe("#123456");
    expect(store.savedState.signature).toBe("");
    expect(store.hasUnsavedChanges).toBe(true);
    expect(modal.hasUnsavedChanges).toBe(true);
    expect(harness.saveAction).not.toHaveBeenCalled();
  });

  it("retains an in-flight save through a responsive remount and adopts its normalized result", async () => {
    let finish: ((value: unknown) => void) | undefined;
    harness.saveAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    const { container, store, modal } = mountSignature(settings);
    setValue(field<HTMLTextAreaElement>(container, "signature"), "  Saved after resize  ");
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = store.onSubmit();
    });
    const root = [...roots].at(-1);
    if (!root) throw new Error("Expected a mounted root");
    act(() => root.unmount());
    roots.delete(root);
    const remounted = mount(createElement(AccountSignature, { account: modal.form, store }));
    expect(store.isLoading).toBe(true);
    expect(store.hasUnsavedChanges).toBe(true);
    expect(saveButton(remounted).disabled).toBe(true);
    await act(async () => {
      finish?.({ ok: true, data: { ...modal.form, signature: "Saved after resize" } });
      await pending;
    });
    expect(field<HTMLTextAreaElement>(remounted, "signature").value).toBe("Saved after resize");
    expect(store.savedState.signature).toBe("Saved after resize");
    expect(store.isLoading).toBe(false);
    expect(store.hasUnsavedChanges).toBe(false);
    expect(harness.saveAction).toHaveBeenCalledOnce();
  });

  it("preserves an unsaved signature through Details, Folders and server updates to other settings", async () => {
    const settings = defaultEmailSettings();
    settings.signature = {
      ...settings.signature,
      enabled: true,
      template: SignatureTemplate.plain,
    };
    const account = emailAccount(settings);
    account.folders = [
      {
        id: "inbox",
        name: "Inbox",
        role: "INBOX",
        totalCount: 0,
        unreadCount: 0,
      },
    ];
    const modal = modalStore(account);
    const container = mount(createElement(ConnectedAccountModal));
    await click(field(container, "connected-account-tab-email"));
    expectActiveTab(container, "email", "5xl");
    setValue(field<HTMLTextAreaElement>(container, "signature"), "Unsaved signature");
    await click(field(container, "connected-account-tab-details"));
    expectActiveTab(container, "details", "xl");
    await act(async () => {
      await modal.toggleVisibility(true);
    });
    await click(field(container, "connected-account-tab-folders"));
    await act(async () => {
      await modal.toggleFolder("inbox", true);
    });
    await click(field(container, "connected-account-tab-email"));
    expect(field<HTMLTextAreaElement>(container, "signature").value).toBe("Unsaved signature");
    expect(modal.hasUnsavedChanges).toBe(true);
    expect(harness.saveAction).not.toHaveBeenCalled();
  });

  it("returns to Details and hydrates a new account without carrying the previous draft", async () => {
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    const modal = modalStore(emailAccount(settings));
    const container = mount(createElement(ConnectedAccountModal));
    await click(field(container, "connected-account-tab-email"));
    setValue(field<HTMLTextAreaElement>(container, "signature"), "Account A draft");
    act(() =>
      modal.openWith({
        ...emailAccount(settings),
        id: "b7f2c558-d461-490e-8b9b-af1089a52643",
        signature: "Account B saved",
      }),
    );
    expectActiveTab(container, "details", "xl");
    expect(field<HTMLTextAreaElement>(container, "signature").value).toBe("Account B saved");
    expect(modal.hasUnsavedChanges).toBe(false);
  });

  it.each(["email", "folders"])("falls back to Details when %s becomes unavailable", async (tab) => {
    const account = emailAccount();
    account.folders = [
      {
        id: "inbox",
        name: "Inbox",
        role: "INBOX",
        totalCount: 0,
        unreadCount: 0,
      },
    ];
    const modal = modalStore(account);
    const container = mount(createElement(ConnectedAccountModal));
    await click(field(container, "connected-account-tab-" + tab));
    act(() => modal.onInitOrRefresh(tab === "email" ? { isOwner: false } : { folders: [] }));
    expect(container.querySelector("#connected-account-tab-" + tab)).toBeNull();
    expectActiveTab(container, "details", "xl");
  });

  it("keeps closing controls stable while invalidating saves until the next account is hydrated", async () => {
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    settings.signature.template = SignatureTemplate.sideBySide;
    const warning = vi.spyOn(console, "warn");
    try {
      const { store, modal } = mountSignature(settings);
      act(() => modal.close());
      expect(store.accountId).toBe("");
      expect(store.isReadOnly).toBe(false);
      act(() => store.onChange("signature", "Cannot save a closed form"));
      await store.onSubmit();
      expect(harness.saveAction).not.toHaveBeenCalled();
      expect(warning.mock.calls.filter((args) => String(args[0]).includes("Select is changing"))).toEqual([]);
    } finally {
      warning.mockRestore();
    }
  });

  it("disables an observed form when the current user's update permission is revoked", async () => {
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    const account = emailAccount(settings);
    const modal = modalStore(account);
    const userStore = observable(
      {
        user: { canUpdate: true },
        can() {
          return this.user.canUpdate;
        },
      },
      { can: action },
    );
    if (!harness.rootStore) throw new Error("Expected a root store");
    harness.rootStore.userStore = userStore;
    const store = modal.signatureStore;
    const container = mount(createElement(AccountSignature, { account, store }));
    const signature = field<HTMLTextAreaElement>(container, "signature");
    setValue(signature, "Pending edit");
    expect(signature.disabled).toBe(false);
    act(() =>
      runInAction(() => {
        userStore.user = { canUpdate: false };
      }),
    );
    expect(signature.disabled).toBe(true);
    expect(store.isReadOnly).toBe(true);
    await store.onSubmit();
    expect(harness.saveAction).not.toHaveBeenCalled();
  });

  it("resets the owned form when closing and rejects saves for a non-owner", async () => {
    const { store, modal } = mountSignature();
    act(() => store.onChange("signature", "Unsaved"));
    expect(modal.hasUnsavedChanges).toBe(true);
    act(() => modal.close());
    expect(store.hasUnsavedChanges).toBe(false);
    expect(modal.hasUnsavedChanges).toBe(false);
    act(() => store.hydrate({ ...emailAccount(), isOwner: false }));
    act(() => store.onChange("signature", "Forbidden"));
    await store.onSubmit();
    expect(harness.saveAction).not.toHaveBeenCalled();
  });

  it("does not overwrite another account when an old save completes after closing", async () => {
    let finish: ((value: unknown) => void) | undefined;
    harness.saveAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { store, modal } = mountSignature();
    const accountA = modal.form;
    act(() => store.onChange("signature", "Save A"));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = store.onSubmit();
    });
    const accountB = {
      ...emailAccount(),
      id: "b7f2c558-d461-490e-8b9b-af1089a52643",
      signature: "Saved B",
    };
    act(() => {
      modal.close();
      modal.openWith(accountB);
      store.hydrate(accountB);
    });
    await act(async () => {
      finish?.({ ok: true, data: { ...accountA, signature: "Save A" } });
      await pending;
    });
    expect(modal.form.id).toBe(accountB.id);
    expect(store.form.signature).toBe("Saved B");
    expect(store.hasUnsavedChanges).toBe(false);
    expect(harness.upsertItem).toHaveBeenCalledOnce();
  });
});
