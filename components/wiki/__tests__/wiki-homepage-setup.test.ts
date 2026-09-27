import type { Root } from "react-dom/client";

import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

const harness = vi.hoisted(() => ({
  action: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/app/[locale]/(protected)/wiki/setup-action", () => ({
  startWikiHomepageSetupAction: harness.action,
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => void | Promise<void>) => void action(),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({
  toastZodErrorTree: harness.toast,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: harness.refresh }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    navigationGuard: { register: vi.fn(), unregister: vi.fn(), isGuarding: false },
    terminologyStore: { overrides: [] },
  }),
}));

import { WikiHomepageSetup } from "../wiki-homepage-setup";

let container: HTMLDivElement;
let root: Root;
let onContinue: ReturnType<typeof vi.fn<() => void>>;
let onSkip: ReturnType<typeof vi.fn<() => void>>;

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

function button(label: string) {
  const element = [...container.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!element) throw new Error(`Button ${label} did not render.`);
  return element;
}

function render(initialState?: WikiHomepageSetupState, props: Partial<ComponentProps<typeof WikiHomepageSetup>> = {}) {
  act(() =>
    root.render(
      createElement(WikiHomepageSetup, {
        initialState,
        renderConversation: (conversationId) =>
          createElement("div", { "data-inline-conversation": conversationId }, "Inline Mate task"),
        onContinue: () => onContinue(),
        onSkip: () => onSkip(),
        ...props,
      }),
    ),
  );
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
  onContinue = vi.fn<() => void>();
  onSkip = vi.fn<() => void>();
  render();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("WikiHomepageSetup", () => {
  it("keeps the onboarding decision focused on the website and two actions", () => {
    expect(input().getAttribute("aria-describedby")).toBeNull();
    expect(container.querySelector('label[for="wiki-homepage"]')?.textContent).toContain("WikiSetup.homepageLabel");
    expect(input().parentElement?.querySelector("svg")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(container.textContent).toContain("WikiSetup.skip");
    expect(container.textContent).toContain("WikiSetup.start");
  });

  it("deduplicates submission and transitions to a durable visible-task state", async () => {
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
    expect(button("WikiSetup.start").disabled).toBe(true);
    expect(button("WikiSetup.skip").disabled).toBe(true);

    await act(async () => {
      resolve({
        ok: true,
        data: {
          conversationId: "conversation-1",
          homepage: "https://example.com/",
          domain: "example.com",
        },
      });
      await Promise.resolve();
    });

    expect(container.querySelector('[data-inline-conversation="conversation-1"]')).not.toBeNull();
    expect(container.textContent).toContain("WikiSetup.status.workingTitle");
    expect(container.textContent).toContain("example.com");
    expect(container.querySelector("form")).toBeNull();
    expect(harness.refresh).toHaveBeenCalledOnce();

    act(() => button("WikiSetup.continueBackground").click());
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("embeds the restored Mate task and keeps Continue below it", () => {
    render({
      status: "working",
      homepage: "https://example.com/",
      domain: "example.com",
      conversationId: "conversation-1",
      pages: [],
    });

    const inlineConversation = container.querySelector('[data-inline-conversation="conversation-1"]');
    if (!inlineConversation) throw new Error("Inline conversation did not render.");
    expect(container.textContent).toContain("Inline Mate task");
    expect(container.textContent).toContain("WikiSetup.status.workingBody example.com");
    expect(container.textContent).toContain("WikiSetup.continueBackground");
    expect(button("WikiSetup.continueBackground").compareDocumentPosition(inlineConversation)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
    act(() => button("WikiSetup.continueBackground").click());
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows which onboarding action is still completing", () => {
    render(
      {
        status: "working",
        homepage: "https://example.com/",
        domain: "example.com",
        conversationId: "conversation-1",
        pages: [],
      },
      { disabled: true },
    );

    const status = container.querySelector("section");
    expect(status?.getAttribute("aria-busy")).toBe("true");
    expect(button("WikiSetup.continueBackground").disabled).toBe(true);
    expect(button("WikiSetup.continueBackground").querySelector("svg.animate-spin")).not.toBeNull();

    render(undefined, { disabled: true });

    expect(form().getAttribute("aria-busy")).toBe("true");
    expect(button("WikiSetup.skip").disabled).toBe(true);
    expect(button("WikiSetup.skip").querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("uses the inline task instead of duplicate completed-page rows", () => {
    render({
      status: "completed",
      homepage: "https://example.com/",
      domain: "example.com",
      conversationId: "conversation-1",
      pages: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "Company Overview",
          createdAt: new Date("2026-09-22T00:00:00.000Z"),
          updatedAt: new Date("2026-09-22T00:00:00.000Z"),
        },
      ],
    });

    expect(container.querySelector('[data-inline-conversation="conversation-1"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Company Overview");
    expect(container.textContent).toContain("WikiSetup.continue");
    expect(container.textContent).not.toContain("WikiSetup.continueBackground");
  });

  it("keeps completed page names when the initiating conversation is not visible to this user", () => {
    render({
      status: "completed",
      homepage: "https://example.com/",
      domain: "example.com",
      conversationId: null,
      pages: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "Company Overview",
          createdAt: new Date("2026-09-22T00:00:00.000Z"),
          updatedAt: new Date("2026-09-22T00:00:00.000Z"),
        },
      ],
    });

    expect(container.textContent).toContain("WikiSetup.status.completedBodyOnboarding");
    expect(container.textContent).toContain("Company Overview");
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[data-inline-conversation]")).toBeNull();
    expect(container.textContent).not.toContain("WikiSetup.tryAnother");
  });

  it("focuses the homepage field when retry opens and hides retry when setup is unavailable", () => {
    const failed = {
      status: "failed" as const,
      homepage: "https://example.com/",
      domain: "example.com",
      conversationId: null,
      pages: [],
    };
    render(failed);
    act(() => button("WikiSetup.tryAnother").click());
    expect(document.activeElement).toBe(input());

    render(failed, { canStart: false });
    expect(container.textContent).toContain("WikiSetup.status.failedTitle");
    expect(container.textContent).not.toContain("WikiSetup.tryAnother");
    expect(container.textContent).toContain("WikiSetup.continue");
  });

  it("does not embed a task when another workspace member started setup", () => {
    render({
      status: "working",
      homepage: "https://example.com/",
      domain: "example.com",
      conversationId: null,
      pages: [],
    });

    expect(container.textContent).toContain("WikiSetup.status.workingBodyNoTask example.com");
    expect(container.querySelector("[data-inline-conversation]")).toBeNull();
  });

  it("shows a neutral zero-page result and keeps the Mate task available", () => {
    render({
      status: "noContent",
      homepage: "https://example.com/",
      domain: "example.com",
      conversationId: "conversation-1",
      pages: [],
    });

    expect(container.textContent).toContain("WikiSetup.status.noContentTitle");
    expect(container.textContent).toContain("WikiSetup.status.noContentBody");
    expect(container.textContent).toContain("Inline Mate task");
    expect(container.textContent).toContain("WikiSetup.tryAnother");
  });

  it("preserves the submitted homepage after validation failures and rotates the request id", async () => {
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
    expect(input().value).toBe("bad.example");
    expect(harness.action.mock.calls[1][0].clientRequestId).not.toBe(firstRequestId);
    expect(button("WikiSetup.start").disabled).toBe(false);
  });
});
