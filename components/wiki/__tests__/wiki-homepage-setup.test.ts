import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  action: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/app/[locale]/(protected)/wiki/setup-action", () => ({
  startWikiHomepageSetupAction: harness.action,
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => Promise<void>) => void action(),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: harness.toast }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { WikiHomepageSetup } from "../wiki-homepage-setup";

let container: HTMLDivElement;
let root: Root;
let onAccepted: (conversationId: string) => void;
let onSkip: () => void;

const nativeInputValueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
const setNativeInputValue = (element: HTMLInputElement, value: string) =>
  nativeInputValueDescriptor?.set?.call(element, value);

function input() {
  const element = container.querySelector<HTMLInputElement>("#wiki-homepage");
  if (!element) throw new Error("Homepage input did not render.");
  return element;
}

function form() {
  const element = container.querySelector<HTMLFormElement>("form");
  if (!element) throw new Error("Homepage form did not render.");
  return element;
}

function startButton() {
  const element = container.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!element) throw new Error("Start button did not render.");
  return element;
}

function skipButton() {
  const element = container.querySelector<HTMLButtonElement>('button[type="button"]');
  if (!element) throw new Error("Skip button did not render.");
  return element;
}

function typeHomepage(value: string) {
  act(() => {
    setNativeInputValue(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit() {
  form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onAccepted = vi.fn<(conversationId: string) => void>();
  onSkip = vi.fn<() => void>();
  act(() =>
    root.render(
      createElement(WikiHomepageSetup, {
        onAccepted: (conversationId) => onAccepted(conversationId),
        onSkip: () => onSkip(),
      }),
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("WikiHomepageSetup", () => {
  it("starts disabled and offers an independent Skip action", () => {
    expect(input()).toMatchObject({ type: "text", inputMode: "url", autocomplete: "url" });
    expect(input().getAttribute("aria-describedby")).toBe("wiki-homepage-help");
    expect(startButton().disabled).toBe(true);

    act(() => skipButton().click());

    expect(onSkip).toHaveBeenCalledOnce();
    expect(harness.action).not.toHaveBeenCalled();
  });

  it("deduplicates submission, disables every control while pending, and accepts the visible conversation", async () => {
    let resolve!: (value: unknown) => void;
    harness.action.mockReturnValue(new Promise((done) => (resolve = done)));
    typeHomepage("example.com");

    await act(async () => {
      submit();
      submit();
      await Promise.resolve();
    });

    expect(harness.action).toHaveBeenCalledOnce();
    expect(harness.action).toHaveBeenCalledWith({
      homepage: "example.com",
      clientRequestId: expect.any(String),
    });
    expect(form().getAttribute("aria-busy")).toBe("true");
    expect(input().disabled).toBe(true);
    expect(startButton().disabled).toBe(true);
    expect(skipButton().disabled).toBe(true);

    await act(async () => {
      resolve({ ok: true, data: { conversationId: "conversation-1" } });
      await Promise.resolve();
    });

    expect(onAccepted).toHaveBeenCalledExactlyOnceWith("conversation-1");
    expect(form().getAttribute("aria-busy")).toBe("false");
    expect(input().disabled).toBe(false);

    const firstRequestId = harness.action.mock.calls[0][0].clientRequestId;
    harness.action.mockResolvedValue({ ok: true, data: { conversationId: "conversation-1" } });
    await act(async () => {
      submit();
      await Promise.resolve();
    });
    expect(harness.action.mock.calls[1][0].clientRequestId).not.toBe(firstRequestId);
  });

  it("shows structured failures, keeps a stable retry id, and renews it after an edit", async () => {
    const error = { errors: ["Invalid homepage"] };
    harness.action.mockResolvedValue({ ok: false, error });
    typeHomepage("bad.example");

    await act(async () => {
      submit();
      await Promise.resolve();
    });
    const firstRequestId = harness.action.mock.calls[0][0].clientRequestId;

    await act(async () => {
      submit();
      await Promise.resolve();
    });

    expect(harness.toast).toHaveBeenCalledTimes(2);
    expect(harness.toast).toHaveBeenLastCalledWith(error);
    expect(onAccepted).not.toHaveBeenCalled();
    expect(harness.action.mock.calls[1][0].clientRequestId).toBe(firstRequestId);
    expect(startButton().disabled).toBe(false);

    typeHomepage("example.com");
    await act(async () => {
      submit();
      await Promise.resolve();
    });
    expect(harness.action.mock.calls[2][0].clientRequestId).not.toBe(firstRequestId);
  });
});
