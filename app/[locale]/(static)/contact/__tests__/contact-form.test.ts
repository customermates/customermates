import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  sendContactInquiryAction: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  runUserAction: vi.fn(),
}));

vi.mock("../actions", () => ({ sendContactInquiryAction: harness.sendContactInquiryAction }));
vi.mock("sonner", () => ({ toast: { success: harness.toastSuccess, error: harness.toastError } }));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, {
      rich: (key: string, values: { dataPrivacyLink: (children: ReactNode) => ReactNode }) =>
        values.dataPrivacyLink(key),
    }),
}));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ href, children }: { href: string; children?: ReactNode }) => createElement("a", { href }, children),
}));
vi.mock("@/components/shared/unexpected-error-toaster", () => ({ UnexpectedErrorToaster: () => null }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => harness.runUserAction(action()),
}));

import { ContactForm } from "../contact-form";
import { EMPTY_CONTACT_FORM, hasFieldError, isContactFormDirty, toContactInquiry } from "../contact-form.state";

let container: HTMLDivElement;
let root: Root;

function query<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`${selector} is not rendered`);
  return element;
}

function type(selector: string, value: string) {
  const element = query<HTMLInputElement | HTMLTextAreaElement>(selector);
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fillValidInquiry() {
  type("#name", "Example Founder");
  type("#email", "founder@example.com");
  type("#company", "   ");
  type("#message", "I would like to understand the product workflow.");
  act(() => query<HTMLButtonElement>("#privacyAcknowledged").click());
}

async function submit() {
  await act(async () => {
    query<HTMLFormElement>("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await harness.runUserAction.mock.results.at(-1)?.value;
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.clearAllMocks();
  harness.runUserAction.mockImplementation((pending: unknown) => pending);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(ContactForm)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("contact form state", () => {
  it("drops a blank company and keeps every other field", () => {
    expect(toContactInquiry({ ...EMPTY_CONTACT_FORM, name: "A", company: "  " })).toEqual({
      ...EMPTY_CONTACT_FORM,
      name: "A",
      company: undefined,
    });
    expect(toContactInquiry({ ...EMPTY_CONTACT_FORM, company: "Example GmbH" }).company).toBe("Example GmbH");
  });

  it("treats only an untouched form as clean", () => {
    expect(isContactFormDirty(EMPTY_CONTACT_FORM)).toBe(false);
    expect(isContactFormDirty({ ...EMPTY_CONTACT_FORM, privacyAcknowledged: true })).toBe(true);
  });

  it("reads field errors from the server's error tree", () => {
    const errors = { errors: [], properties: { email: { errors: ["Invalid email"] }, name: { errors: [] } } };
    expect(hasFieldError(errors, "email")).toBe(true);
    expect(hasFieldError(errors, "name")).toBe(false);
    expect(hasFieldError(undefined, "email")).toBe(false);
  });
});

describe("contact form", () => {
  it("renders every field with the required markers", () => {
    for (const id of ["name", "email", "company", "message"]) expect(query(`#${id}`)).toBeTruthy();
    expect(query("label[for=name]").textContent).toBe("Common.inputs.name *");
    expect(query("label[for=email]").textContent).toBe("Common.inputs.email *");
    expect(query("label[for=company]").textContent).toBe("Common.inputs.company");
    expect(query("label[for=message]").textContent).toBe("Common.inputs.message *");
    expect(query("label[for=privacyAcknowledged]").textContent).toBe("ContactPage.form.privacyAcknowledgement *");
    expect(query<HTMLAnchorElement>("label[for=privacyAcknowledged] a").getAttribute("href")).toBe("/privacy");
    expect(query<HTMLFormElement>("form").noValidate).toBe(true);
  });

  it("shows the server's validation errors on the fields and in a toast", async () => {
    const error = {
      errors: [],
      properties: {
        email: { errors: ["Invalid email address"] },
        privacyAcknowledged: { errors: ["Please confirm"] },
      },
    };
    harness.sendContactInquiryAction.mockResolvedValue({ ok: false, error });

    type("#email", "not-an-email");
    await submit();

    expect(harness.sendContactInquiryAction).toHaveBeenCalledWith({
      ...EMPTY_CONTACT_FORM,
      email: "not-an-email",
      company: undefined,
    });
    expect(query("#email").getAttribute("aria-invalid")).toBe("true");
    expect(query("#name").getAttribute("aria-invalid")).toBe("false");
    expect(query("label[for=email]").className).toContain("text-destructive");
    expect(query("#privacyAcknowledged").getAttribute("aria-describedby")).toBe("privacyAcknowledged-error");
    expect(query("[role=alert]").textContent).toBe("ContactPage.form.privacyAcknowledgementRequired");
    expect(harness.toastError).toHaveBeenCalledTimes(1);
    expect(query<HTMLInputElement>("#email").value).toBe("not-an-email");
    expect(query<HTMLButtonElement>("button[type=submit]").disabled).toBe(false);
  });

  it("sends a valid inquiry, confirms it and starts over on request", async () => {
    harness.sendContactInquiryAction.mockResolvedValue({ ok: true, data: {} });

    fillValidInquiry();
    await submit();

    expect(harness.sendContactInquiryAction).toHaveBeenCalledWith({
      name: "Example Founder",
      email: "founder@example.com",
      company: undefined,
      message: "I would like to understand the product workflow.",
      privacyAcknowledged: true,
    });
    expect(harness.toastSuccess).toHaveBeenCalledWith("ContactPage.form.successToast");
    expect(container.textContent).toContain("ContactPage.form.successTitle");
    expect(container.querySelector("form")).toBeNull();

    act(() => query<HTMLButtonElement>("button").click());

    expect(query<HTMLInputElement>("#name").value).toBe("");
    expect(query("#privacyAcknowledged").getAttribute("aria-checked")).toBe("false");
  });

  it("disables the form while the inquiry is in flight", async () => {
    let resolve: (value: unknown) => void = () => {};
    harness.sendContactInquiryAction.mockReturnValue(new Promise((settle) => (resolve = settle)));

    fillValidInquiry();
    act(() => {
      query<HTMLFormElement>("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(query<HTMLButtonElement>("button[type=submit]").disabled).toBe(true);
    expect(query<HTMLInputElement>("#name").disabled).toBe(true);

    await act(async () => {
      resolve({ ok: false, error: { errors: [] } });
      await harness.runUserAction.mock.results.at(-1)?.value;
    });

    expect(query<HTMLButtonElement>("button[type=submit]").disabled).toBe(false);
  });

  it("hands a thrown submission to the shared unexpected-error path", async () => {
    const failure = new Error("boom");
    harness.sendContactInquiryAction.mockRejectedValue(failure);
    harness.runUserAction.mockImplementation((pending: Promise<unknown>) => pending.catch(() => undefined));

    fillValidInquiry();
    await submit();

    expect(harness.runUserAction).toHaveBeenCalledTimes(1);
    expect(query<HTMLButtonElement>("button[type=submit]").disabled).toBe(false);
    expect(harness.toastSuccess).not.toHaveBeenCalled();
  });

  it("guards unsaved input against leaving the page", () => {
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    type("#message", "Draft");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
