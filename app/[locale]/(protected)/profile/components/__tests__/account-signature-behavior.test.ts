import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { EmailSettings } from "@/ee/messaging/email-settings";
import type { ReactElement, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";
import { defaultEmailSettings, SignatureTemplate } from "@/ee/messaging/email-settings";

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
  AppModal: ({ children }: { children: ReactNode }) => createElement("div", null, children),
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
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
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
  harness.rootStore = null;
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("AccountSignature", () => {
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
        signature: {
          enabled: false,
          template: SignatureTemplate.sideBySide,
          logoUrl: "http://localhost/logo.png",
        },
      }),
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

describe("ConnectedAccountModal email tab", () => {
  it("preserves an unsaved signature draft while switching to details and back", async () => {
    const settings = defaultEmailSettings();
    settings.signature = { enabled: true, template: SignatureTemplate.plain, logoUrl: "" };
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
    const editor = requiredElement(container.querySelector<HTMLTextAreaElement>("#connected-account-signature"));
    setValue(editor, "**Unsaved signature**");
    expect(editor.value).toBe("**Unsaved signature**");

    await click(detailsTab);
    expect(container.querySelector("#connected-account-signature")).toBe(editor);
    expect(editor.value).toBe("**Unsaved signature**");
    expect(setEmailSettingsDirty).toHaveBeenLastCalledWith(true);

    await click(emailTab);
    expect(container.querySelector("#connected-account-signature")).toBe(editor);
    expect(editor.value).toBe("**Unsaved signature**");
    expect(setEmailSettingsDirty).toHaveBeenLastCalledWith(true);
    expect(saveSignature).not.toHaveBeenCalled();
  });
});
