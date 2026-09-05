import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { EmailSettings } from "@/ee/messaging/email-settings";
import type { ReactElement, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
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
}));

vi.mock("mobx-react-lite", () => ({
  observer: <Component>(component: Component) => component,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/editor/email-markdown-editor", () => ({
  EmailMarkdownEditor: ({
    ariaLabel,
    disabled,
    id,
    onChange,
    value,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    id: string;
    onChange: (value: string) => void;
    value: string;
  }) =>
    createElement("textarea", {
      "aria-label": ariaLabel,
      disabled,
      id,
      value,
      onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value),
    }),
}));

vi.mock("@/app/[locale]/(protected)/inbox/components/email-frame", () => ({
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
  useHydratedIntlStore: () => ({ formatNumericalShortDateTime: () => "date" }),
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

const roots = new Set<Root>();
const rootsByContainer = new WeakMap<HTMLElement, Root>();
const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);
  rootsByContainer.set(container, root);
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
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
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
  const trigger = requiredElement(container.querySelector<HTMLButtonElement>(`#${id}`));
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
  const store = {
    close: vi.fn(),
    form: account,
    saveSignature: vi.fn(() => Promise.resolve(true)),
    setEmailSettingsDirty: vi.fn(),
    toggleFolder: vi.fn(),
    toggleVisibility: vi.fn(),
  };
  harness.rootStore = {
    appMode: "cloud",
    connectedAccountModalStore: store,
    connectedAccountsStore: {
      disconnect: vi.fn(),
      reconnect: vi.fn(),
      resync: vi.fn(),
    },
    subscriptionStore: { subscription: { plan: "pro" } },
    userModalStore: { loadById: vi.fn() },
    userStore: { can: () => true },
  };
  return store;
}

function renderModalAgain(container: HTMLElement) {
  const root = rootsByContainer.get(container);
  if (!root) throw new Error("Expected an existing React root");
  act(() => root.render(createElement(ConnectedAccountModal)));
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

describe("AccountSignature", () => {
  it("saves selected logo size, divider, and spacing through the layout controls", async () => {
    const settings = defaultEmailSettings();
    settings.signature = {
      ...settings.signature,
      enabled: true,
      template: SignatureTemplate.sideBySide,
      logoUrl: "https://cdn.example.com/logo.png",
    };
    const onSave = vi.fn(() => Promise.resolve(true));
    const onDirtyChange = vi.fn();
    const container = mount(
      createElement(AccountSignature, {
        account: emailAccount(settings),
        onDirtyChange,
        onSave,
      }),
    );

    await click(requiredElement(container.querySelector("summary")));
    await chooseOption(container, "signature-logoSize", "ConnectedAccountsCard.emailLogoSizes.large");
    await chooseOption(container, "signature-divider", "ConnectedAccountsCard.emailDividers.line");
    await chooseOption(container, "signature-spacing", "ConnectedAccountsCard.emailSpacings.compact");
    expect(saveButton(container).disabled).toBe(false);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await click(saveButton(container));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("", {
      ...settings,
      signature: {
        ...settings.signature,
        logoSize: SignatureLogoSize.large,
        divider: SignatureDivider.line,
        spacing: SignatureSpacing.compact,
      },
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(saveButton(container).disabled).toBe(true);
  });

  it("retains layout options and Markdown when their controls are hidden or the signature is disabled", async () => {
    const settings = defaultEmailSettings();
    settings.signature = {
      ...settings.signature,
      enabled: true,
      template: SignatureTemplate.sideBySide,
      logoUrl: "https://cdn.example.com/logo.png",
    };
    const onSave = vi.fn(() => Promise.resolve(true));
    const container = mount(
      createElement(AccountSignature, {
        account: emailAccount(settings),
        onDirtyChange: vi.fn(),
        onSave,
      }),
    );
    const enabled = requiredElement(container.querySelector<HTMLInputElement>("#email-signature-enabled"));
    const editor = requiredElement(container.querySelector<HTMLTextAreaElement>("#connected-account-signature"));
    setValue(editor, "**Custom signature**");
    await click(requiredElement(container.querySelector("summary")));
    await chooseOption(container, "signature-logoSize", "ConnectedAccountsCard.emailLogoSizes.large");
    await chooseOption(container, "signature-divider", "ConnectedAccountsCard.emailDividers.line");
    await chooseOption(container, "signature-spacing", "ConnectedAccountsCard.emailSpacings.compact");

    const template = requiredElement(container.querySelector<HTMLSelectElement>('[aria-label="signature-template"]'));
    setValue(template, SignatureTemplate.plain);
    for (const id of ["signature-logoUrl", "signature-logoSize", "signature-divider", "signature-spacing"])
      expect(container.querySelector(`#${id}`)).toBeNull();

    await click(enabled);
    expect(container.querySelector("#connected-account-signature")).toBeNull();
    await click(saveButton(container));
    const retained = {
      ...settings.signature,
      enabled: false,
      template: SignatureTemplate.plain,
      logoSize: SignatureLogoSize.large,
      divider: SignatureDivider.line,
      spacing: SignatureSpacing.compact,
    };
    expect(onSave).toHaveBeenLastCalledWith("**Custom signature**", {
      ...settings,
      signature: retained,
    });

    await click(enabled);
    expect(requiredElement(container.querySelector<HTMLTextAreaElement>("#connected-account-signature")).value).toBe(
      "**Custom signature**",
    );
    setValue(
      requiredElement(container.querySelector<HTMLSelectElement>('[aria-label="signature-template"]')),
      SignatureTemplate.sideBySide,
    );
    expect(container.querySelector("#signature-logoSize")?.textContent).toBe(
      "ConnectedAccountsCard.emailLogoSizes.large",
    );
    expect(container.querySelector("#signature-divider")?.textContent).toBe("ConnectedAccountsCard.emailDividers.line");
    expect(container.querySelector("#signature-spacing")?.textContent).toBe(
      "ConnectedAccountsCard.emailSpacings.compact",
    );
    expect(requiredElement(container.querySelector<HTMLInputElement>("#signature-logoUrl")).value).toBe(
      settings.signature.logoUrl,
    );

    await click(saveButton(container));
    expect(onSave).toHaveBeenLastCalledWith("**Custom signature**", {
      ...settings,
      signature: {
        ...retained,
        enabled: true,
        template: SignatureTemplate.sideBySide,
      },
    });
  });

  it("validates custom hex colours, synchronizes the picker, and saves low-contrast choices", async () => {
    const onSave = vi.fn(() => Promise.resolve(true));
    const container = mount(
      createElement(AccountSignature, { account: emailAccount(), onDirtyChange: vi.fn(), onSave }),
    );
    const hex = requiredElement(container.querySelector<HTMLInputElement>("#email-linkHex"));
    const picker = requiredElement(container.querySelector<HTMLInputElement>('input[type="color"]'));

    expect(container.querySelector("button[aria-pressed]")).toBeNull();
    expect(picker.getAttribute("aria-label")).toBe("ConnectedAccountsCard.emailLinkColourPicker");

    for (const invalid of ["", "#abc", "123456", "#gg0000"]) {
      setValue(hex, invalid);
      expect(hex.getAttribute("aria-invalid")).toBe("true");
      expect(hex.getAttribute("aria-describedby")).toBe("email-linkHex-error");
      expect(container.querySelector("#email-linkHex-error")?.textContent).toBe(
        "ConnectedAccountsCard.emailLinkColourInvalid",
      );
      expect(saveButton(container).disabled).toBe(true);
    }

    setValue(hex, "#Ab12Cd");
    expect(hex.getAttribute("aria-invalid")).toBe("false");
    expect(container.querySelector("#email-linkHex-error")).toBeNull();
    expect(picker.value).toBe("#ab12cd");
    expect(saveButton(container).disabled).toBe(false);

    setValue(picker, "#ffffff");
    expect(hex.value).toBe("#ffffff");
    expect(hex.getAttribute("aria-describedby")).toBe("email-linkHex-contrast");
    expect(container.querySelector("#email-linkHex-contrast")).not.toBeNull();
    expect(saveButton(container).disabled).toBe(false);

    await click(saveButton(container));
    expect(onSave).toHaveBeenCalledWith(
      "",
      expect.objectContaining({ appearance: expect.objectContaining({ linkHex: "#ffffff" }) }),
    );
  });

  it("locks settings while a save is in flight", async () => {
    let finishSave: ((saved: boolean) => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSave = resolve;
        }),
    );
    const onDirtyChange = vi.fn();
    const container = mount(createElement(AccountSignature, { account: emailAccount(), onDirtyChange, onSave }));
    const fontSize = requiredElement(container.querySelector<HTMLInputElement>("#email-fontSize"));

    setValue(fontSize, "14");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await click(saveButton(container));
    expect(fontSize.disabled).toBe(true);
    expect(requiredElement(container.querySelector<HTMLInputElement>("#email-signature-enabled")).disabled).toBe(true);
    expect(saveButton(container).disabled).toBe(true);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      finishSave?.(true);
      await Promise.resolve();
    });

    expect(fontSize.disabled).toBe(false);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("shows signature fields only when enabled and validates logo URLs only for logo layouts", async () => {
    const settings = defaultEmailSettings();
    settings.signature = {
      ...settings.signature,
      enabled: false,
      template: SignatureTemplate.sideBySide,
      logoUrl: "http://localhost/logo.png",
    };
    const onDirtyChange = vi.fn();
    const onSave = vi.fn(() => Promise.resolve(true));
    const container = mount(
      createElement(AccountSignature, { account: emailAccount(settings), onDirtyChange, onSave }),
    );
    const enabled = requiredElement(container.querySelector<HTMLInputElement>("#email-signature-enabled"));
    const fontSize = requiredElement(container.querySelector<HTMLInputElement>("#email-fontSize"));

    expect(container.querySelector('[aria-label="signature-template"]')).toBeNull();
    expect(container.querySelector("#signature-logoUrl")).toBeNull();
    expect(container.querySelector("#connected-account-signature")).toBeNull();

    setValue(fontSize, "14");
    expect(saveButton(container).disabled).toBe(false);

    await click(enabled);
    let template = requiredElement(container.querySelector<HTMLSelectElement>('[aria-label="signature-template"]'));
    let logoUrl = requiredElement(container.querySelector<HTMLInputElement>("#signature-logoUrl"));

    expect(container.querySelector("#connected-account-signature")).not.toBeNull();
    expect(logoUrl.getAttribute("aria-invalid")).toBe("true");
    expect(saveButton(container).disabled).toBe(true);

    setValue(template, SignatureTemplate.plain);
    expect(container.querySelector("#signature-logoUrl")).toBeNull();
    expect(saveButton(container).disabled).toBe(false);

    template = requiredElement(container.querySelector<HTMLSelectElement>('[aria-label="signature-template"]'));
    setValue(template, SignatureTemplate.sideBySide);
    logoUrl = requiredElement(container.querySelector<HTMLInputElement>("#signature-logoUrl"));
    expect(saveButton(container).disabled).toBe(true);

    setValue(logoUrl, "https://cdn.example.com/logo.png");
    expect(logoUrl.getAttribute("aria-invalid")).toBe("false");
    expect(saveButton(container).disabled).toBe(false);

    setValue(logoUrl, "http://localhost/logo.png");
    expect(saveButton(container).disabled).toBe(true);

    await click(enabled);
    expect(container.querySelector('[aria-label="signature-template"]')).toBeNull();
    expect(container.querySelector("#signature-logoUrl")).toBeNull();
    expect(container.querySelector("#connected-account-signature")).toBeNull();
    expect(saveButton(container).disabled).toBe(false);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await click(saveButton(container));
    expect(onSave).toHaveBeenCalledWith(
      "",
      expect.objectContaining({
        appearance: expect.objectContaining({ fontSize: 14 }),
        signature: expect.objectContaining({
          enabled: false,
          template: SignatureTemplate.sideBySide,
          logoUrl: "http://localhost/logo.png",
        }),
      }),
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

describe("ConnectedAccountModal email tab", () => {
  it("returns to Details at xl when switching accounts instead of carrying Email state or its draft", async () => {
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    const accountA = emailAccount(settings);
    const store = modalStore(accountA);
    const container = mount(createElement(ConnectedAccountModal));
    await click(requiredElement(container.querySelector<HTMLButtonElement>("#connected-account-tab-email")));
    expectActiveTab(container, "email", "5xl");
    const editorA = requiredElement(container.querySelector<HTMLTextAreaElement>("#connected-account-signature"));
    setValue(editorA, "Account A unsaved draft");

    store.form = {
      ...emailAccount(settings),
      id: "b7f2c558-d461-490e-8b9b-af1089a52643",
      signature: "Account B saved",
    };
    renderModalAgain(container);
    expectActiveTab(container, "details", "xl");
    const editorB = requiredElement(container.querySelector<HTMLTextAreaElement>("#connected-account-signature"));
    expect(editorB).not.toBe(editorA);
    expect(editorB.value).toBe("Account B saved");

    await click(requiredElement(container.querySelector<HTMLButtonElement>("#connected-account-tab-email")));
    expectActiveTab(container, "email", "5xl");
    expect(editorB.value).toBe("Account B saved");
    expect(store.saveSignature).not.toHaveBeenCalled();
  });

  it.each(["email", "folders"])(
    "falls back to Details at xl when the active %s tab becomes unavailable",
    async (tab) => {
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
      const store = modalStore(account);
      const container = mount(createElement(ConnectedAccountModal));
      await click(requiredElement(container.querySelector<HTMLButtonElement>(`#connected-account-tab-${tab}`)));
      expectActiveTab(container, tab, tab === "email" ? "5xl" : "xl");

      store.form = tab === "email" ? { ...account, isOwner: false } : { ...account, folders: [] };
      renderModalAgain(container);
      expect(container.querySelector(`#connected-account-tab-${tab}`)).toBeNull();
      expectActiveTab(container, "details", "xl");
      expect(container.querySelector('[role="tabpanel"][data-state="active"]')?.textContent).toContain(
        "ConnectedAccountsCard.provider",
      );
    },
  );

  it("preserves an unsaved signature draft while switching to details and back", async () => {
    const settings = defaultEmailSettings();
    settings.signature = { ...settings.signature, enabled: true, template: SignatureTemplate.plain, logoUrl: "" };
    const account = emailAccount(settings);
    const saveSignature = vi.fn(() => Promise.resolve(true));
    const setEmailSettingsDirty = vi.fn();
    harness.rootStore = {
      appMode: "cloud",
      connectedAccountModalStore: {
        close: vi.fn(),
        form: account,
        saveSignature,
        setEmailSettingsDirty,
        toggleFolder: vi.fn(),
        toggleVisibility: vi.fn(),
      },
      connectedAccountsStore: {
        disconnect: vi.fn(),
        reconnect: vi.fn(),
        resync: vi.fn(),
      },
      subscriptionStore: { subscription: { plan: "pro" } },
      userModalStore: { loadById: vi.fn() },
      userStore: { can: () => true },
    };

    const container = mount(createElement(ConnectedAccountModal));
    const emailTab = requiredElement(container.querySelector<HTMLButtonElement>("#connected-account-tab-email"));
    const detailsTab = requiredElement(container.querySelector<HTMLButtonElement>("#connected-account-tab-details"));

    await click(emailTab);
    expectActiveTab(container, "email", "5xl");
    const editor = requiredElement(container.querySelector<HTMLTextAreaElement>("#connected-account-signature"));
    setValue(editor, "**Unsaved signature**");
    expect(editor.value).toBe("**Unsaved signature**");

    await click(detailsTab);
    expectActiveTab(container, "details", "xl");
    expect(container.querySelector("#connected-account-signature")).toBe(editor);
    expect(editor.value).toBe("**Unsaved signature**");
    expect(setEmailSettingsDirty).toHaveBeenLastCalledWith(true);

    await click(emailTab);
    expectActiveTab(container, "email", "5xl");
    expect(container.querySelector("#connected-account-signature")).toBe(editor);
    expect(editor.value).toBe("**Unsaved signature**");
    expect(setEmailSettingsDirty).toHaveBeenLastCalledWith(true);
    expect(saveSignature).not.toHaveBeenCalled();
  });
});
