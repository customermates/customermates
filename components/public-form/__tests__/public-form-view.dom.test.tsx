import type { Root } from "react-dom/client";
import type { PublicFormView as PublicFormModel } from "@/features/public-form/public-form.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const translate = vi.hoisted(
  () => (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
);

vi.mock("next-intl", () => ({ useTranslations: () => translate }));
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => createElement("img", { alt, src }),
}));
vi.mock("@/core/utils/public-signup", () => ({ publicSignupHref: () => "/signup?from=form" }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));

import { PublicFormView } from "../public-form-view";

import { NAME_FIELD } from "./public-form-fixtures";

const FORM: PublicFormModel = {
  title: "Contact us",
  description: "We answer within a day.",
  submitLabel: "Send",
  workspaceName: "Acme GmbH",
  locale: null,
  fields: [
    {
      fieldId: NAME_FIELD,
      label: "Name",
      helpText: null,
      required: true,
      valueType: "text",
      multiple: false,
      options: [],
      currency: null,
    },
  ],
  person: { emailLabel: "Email", nameLabel: null },
  consent: { text: "I agree to be contacted.", privacyUrl: "https://example.com/privacy" },
  badge: false,
  renderToken: "render",
};

let container: HTMLDivElement;
let root: Root;

async function renderView(props: Partial<Parameters<typeof PublicFormView>[0]> = {}) {
  await act(async () => {
    root.render(createElement(PublicFormView, { form: FORM, token: "t", locale: "en", embedded: false, ...props }));
    await Promise.resolve();
  });
}

const card = () => container.querySelector("[data-public-form-card]");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PublicFormView page", () => {
  it("puts the workspace, the title, the questions, the visible consent text and the button into one card", async () => {
    await renderView();

    const page = card();
    expect(container.querySelectorAll("[data-public-form-card]")).toHaveLength(1);
    expect(page?.querySelector("[data-public-form-workspace]")?.textContent).toContain("A");
    expect(page?.querySelector("[data-public-form-workspace]")?.textContent).toContain(
      'PublicForm.byline:{"workspace":"Acme GmbH"}',
    );
    expect(page?.querySelector("#public-form-title")?.textContent).toBe("Contact us");
    expect(page?.textContent).toContain("We answer within a day.");
    expect(page?.textContent).toContain("Name");
    expect(page?.querySelector("#public-form-consent")).not.toBeNull();
    expect(page?.textContent).toContain("I agree to be contacted.");
    expect(page?.querySelector('a[href="https://example.com/privacy"]')).not.toBeNull();
    expect(page?.querySelector("#public-form-submit")?.textContent).toBe("Send");
  });

  it("shows no badge on a paid plan and the badge outside the card on the free plan", async () => {
    await renderView();
    expect(container.querySelector("#public-form-badge")).toBeNull();

    await renderView({ form: { ...FORM, badge: true } });
    const badge = container.querySelector("#public-form-badge");
    expect(badge).not.toBeNull();
    expect(card()?.contains(badge)).toBe(false);
  });

  it("leaves out the workspace line when the workspace has no name", async () => {
    await renderView({ form: { ...FORM, workspaceName: null } });

    expect(container.querySelector("[data-public-form-workspace]")).toBeNull();
    expect(card()).not.toBeNull();
  });
});

describe("PublicFormView done state", () => {
  it("answers a sent form with a friendly done card that keeps the message and the workspace", async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ status: "submitted", message: "We will call you back.", redirectUrl: null });
    await renderView({ onSubmit });
    const typeInto = (selector: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(`${selector} did not render.`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      act(() => {
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    typeInto("#public-form-email", "ada@example.com");
    typeInto(`#public-form-field-${NAME_FIELD}`, "Ada");
    act(() => container.querySelector<HTMLInputElement>("#public-form-consent")?.click());

    await act(async () => {
      container
        .querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(card()?.querySelector("#public-form-sent-title")?.textContent).toBe("PublicForm.sentTitle");
    expect(card()?.querySelector("#public-form-sent-message")?.textContent).toBe("We will call you back.");
    expect(card()?.querySelector("svg")).not.toBeNull();
    expect(card()?.querySelector("[data-public-form-workspace]")).not.toBeNull();
    expect(container.querySelector("#public-form-submit")).toBeNull();
  });

  it("shows the done card of the draft for the preview without sending anything", async () => {
    await renderView({ doneMessage: "Thanks, see you soon." });

    expect(card()?.querySelector("#public-form-sent-message")?.textContent).toBe("Thanks, see you soon.");
    expect(container.querySelector("#public-form-title")).toBeNull();
  });

  it("keeps the preview locked: the form has no submit handler", async () => {
    await renderView({ embedded: true });

    expect(container.querySelector<HTMLButtonElement>("#public-form-submit")?.disabled).toBe(true);
  });
});
