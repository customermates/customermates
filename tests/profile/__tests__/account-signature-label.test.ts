// @vitest-environment jsdom

import type { RootStore } from "@/core/stores/root.store";
import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement, forwardRef, useImperativeHandle, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";
import { defaultEmailSettings } from "@/ee/messaging/email-settings";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/modal/use-navigation-guard", () => ({ useNavigationGuard: vi.fn() }));
vi.mock("@/app/[locale]/(protected)/profile/connected-accounts/actions", () => ({
  setConnectedAccountSignatureAction: vi.fn(),
}));
vi.mock("@/components/editor/email-markdown-editor", () => ({
  EmailMarkdownEditor: forwardRef<{ focus: () => void }, { ariaLabel: string; id: string }>(
    function EmailMarkdownEditor({ ariaLabel, id }, ref) {
      const editableRef = useRef<HTMLDivElement>(null);
      useImperativeHandle(ref, () => ({ focus: () => editableRef.current?.focus() }));

      return createElement("div", {
        ref: editableRef,
        "aria-label": ariaLabel,
        contentEditable: true,
        id,
        role: "textbox",
        suppressContentEditableWarning: true,
        tabIndex: 0,
      });
    },
  ),
}));
vi.mock("@/features/messaging/email-frame", () => ({ EmailFrame: () => null }));
vi.mock("@/ee/messaging/outbound/email-signature", () => ({
  composeEmailBodies: () => ({ html: "<p>Preview</p>", text: "Preview" }),
}));
vi.mock("@/app/[locale]/(protected)/profile/components/signature-template-picker", () => ({
  SignatureTemplatePicker: () => null,
}));
vi.mock("@/app/[locale]/(protected)/profile/components/signature-layout-options", () => ({
  SignatureLayoutOptions: () => null,
}));
vi.mock("@/app/[locale]/(protected)/profile/components/signature-color-field", () => ({
  EmailLinkColorField: () => null,
}));
vi.mock("@/components/forms/form-select", () => ({ FormSelect: () => null }));
vi.mock("@/components/forms/form-number-input", () => ({ FormNumberInput: () => null }));
vi.mock("@/components/forms/form-input", () => ({ FormInput: () => null }));
vi.mock("@/components/forms/form-switch", () => ({
  FormSwitch: ({ children }: { children?: ReactNode }) => children ?? null,
}));

import { AccountSignature } from "@/app/[locale]/(protected)/profile/components/account-signature";
import { AccountSignatureStore } from "@/app/[locale]/(protected)/profile/components/account-signature.store";

const roots = new Set<Root>();

function account(): ConnectedAccountDto {
  const emailSettings = defaultEmailSettings();
  emailSettings.signature.enabled = true;

  return {
    id: "03f07663-3ddb-4b33-bf31-6b00f25a5194",
    displayName: "Inbox",
    provider: MessagingProvider.outlook,
    status: ConnectedAccountStatus.ok,
    syncing: false,
    shared: false,
    hasMessaging: true,
    hasCalendar: false,
    signature: "Best regards",
    emailSettings,
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

function mountSignature() {
  const rootStore = {
    localeStore: { getTranslation: (key: string) => key },
    userStore: { can: () => true, canManage: () => true, canAccess: () => true, user: { id: "user-1" } },
  };
  const store = new AccountSignatureStore(rootStore as unknown as RootStore);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);
  act(() => root.render(createElement(AccountSignature, { account: account(), store })));
  return container;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
});

describe("AccountSignature signature label", () => {
  it("moves focus into the rich-text signature editor, which a native label cannot target", () => {
    const container = mountSignature();
    const label = [...container.querySelectorAll("label")].find(
      (element) => element.textContent === "ConnectedAccountsCard.emailSignatureContent",
    );
    const editor = container.querySelector<HTMLElement>('[id="signature"]');
    if (!label || !editor) throw new Error("Expected the signature label and editor");

    act(() => label.click());

    expect(label.getAttribute("for")).toBe("signature");
    expect(document.activeElement).toBe(editor);
  });
});
