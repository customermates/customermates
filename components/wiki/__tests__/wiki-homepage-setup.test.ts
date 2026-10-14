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

vi.mock("@/app/[locale]/(protected)/wiki/actions", () => ({
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
    recordWorkspaceStore: { navigation: null },
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
  vi.restoreAllMocks();
});

describe("WikiHomepageSetup", () => {
  it.each(["queued", "discovering", "fetching", "importing", "synthesizing"] as const)(
    "shows honest inline %s crawl progress",
    (crawlPhase) => {
      render({
        status: "working",
        homepage: "https://example.com/",
        domain: "example.com",
        pages: [],
        crawlPhase,
        progress: { fetched: 7, total: 24 },
      });
      const progress = container.querySelector('[data-testid="wiki-setup-crawl-progress"]');
      expect(progress?.getAttribute("role")).toBe("status");
      expect(progress?.querySelectorAll("ol > li")).toHaveLength(3);
      if (crawlPhase === "queued" || crawlPhase === "discovering") {
        expect(progress?.querySelector('[aria-current="step"]')?.textContent).toContain(
          "WikiSetup.crawlProgress.discovering",
        );
      }
      if (crawlPhase === "fetching") {
        expect(progress?.querySelector('[aria-current="step"]')?.textContent).toContain(
          "WikiSetup.crawlProgress.readingCount 7 24",
        );
      }
      if (crawlPhase === "importing" || crawlPhase === "synthesizing") {
        expect(progress?.querySelector('[aria-current="step"]')?.textContent).toContain(
          "WikiSetup.crawlProgress.writingStep",
        );
      }
      expect(container.querySelector('textarea, input, [role="log"]')).toBeNull();
    },
  );

  it("shows the actual discovered URLs and distinguishes the current read from failed and pending pages", () => {
    render({
      status: "working",
      homepage: "https://example.com/",
      domain: "example.com",
      pages: [],
      crawlPhase: "fetching",
      progress: {
        fetched: 1,
        total: 4,
        pages: [
          { url: "https://example.com/", status: "read" },
          { url: "https://example.com/about", status: "reading" },
          { url: "https://example.com/missing", status: "failed" },
          { url: "https://example.com/help", status: "pending" },
        ],
      },
    });
    const progress = container.querySelector('[data-testid="wiki-setup-crawl-progress"]');
    expect(progress?.querySelectorAll("ol > li")).toHaveLength(3);
    expect(progress?.querySelectorAll("ul > li")).toHaveLength(4);
    expect(
      progress?.querySelector(
        '[aria-label="WikiSetup.crawlProgress.reading: https://example.com/about"] svg.animate-spin',
      ),
    ).not.toBeNull();
    expect(
      progress?.querySelector('[aria-label="WikiSetup.crawlProgress.failed: https://example.com/missing"]'),
    ).not.toBeNull();
    expect(
      progress?.querySelector(
        '[aria-label="WikiSetup.crawlProgress.pending: https://example.com/help"] svg.animate-spin',
      ),
    ).toBeNull();
    expect(progress?.textContent).toContain("WikiSetup.crawlProgress.found 4");
  });

  it.each(["pending", "reading"] as const)("does not mark a partial terminal crawl complete (%s)", (status) => {
    render({
      status: "failed",
      homepage: "https://example.com/",
      domain: "example.com",
      pages: [],
      progress: {
        fetched: 1,
        total: 2,
        failed: 0,
        pages: [
          { url: "https://example.com/", status: "read" },
          { url: "https://example.com/about", status },
        ],
      },
    });
    const progress = container.querySelector('[data-testid="wiki-setup-crawl-progress"]');
    expect(progress?.querySelector('ol > li[aria-label="WikiSetup.status.failedTitle"]')).not.toBeNull();
    expect(progress?.querySelector("svg.animate-spin")).toBeNull();
  });

  it("finishes reading with usable pages while showing a failed page as skipped", () => {
    render({
      status: "completed",
      homepage: "https://example.com/",
      domain: "example.com",
      pages: [],
      progress: {
        fetched: 1,
        total: 2,
        failed: 1,
        pages: [
          { url: "https://example.com/", status: "read" },
          { url: "https://example.com/unavailable", status: "failed" },
        ],
      },
    });
    act(() => button("WikiSetup.crawlProgress.steps").click());
    const progress = container.querySelector('[data-testid="wiki-setup-crawl-progress"]');
    expect(progress?.querySelector('ol > li[aria-label="WikiSetup.crawlProgress.read"]')).not.toBeNull();
    expect(progress?.querySelector(".text-destructive")).toBeNull();
    expect(
      progress?.querySelector('[aria-label="WikiSetup.crawlProgress.failed: https://example.com/unavailable"]'),
    ).not.toBeNull();
  });

  it("keeps the onboarding decision focused on the website, one language and two actions", () => {
    expect(input().getAttribute("aria-describedby")).toBeNull();
    expect(container.querySelector('label[for="wiki-homepage"]')?.textContent).toContain("WikiSetup.homepageLabel");
    expect(input().parentElement?.querySelector("svg")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect(container.querySelector('[role="combobox"]')?.textContent).toContain("Common.locales.en");
    expect(container.textContent).toContain("OnboardingWizard.wiki.skip");
    expect(container.textContent).toContain("WikiSetup.start");
  });

  it("defaults a new Wiki to the browser language even when the interface uses another language", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-AT", "en"]);
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => {
      render();
      await Promise.resolve();
    });
    expect(container.querySelector('[role="combobox"]')?.textContent).toContain("Common.locales.de");
    harness.action.mockResolvedValue({
      ok: true,
      data: { homepage: "https://example.com/", domain: "example.com" },
    });
    typeHomepage("example.com");
    await act(async () => {
      submit();
      await Promise.resolve();
    });
    expect(harness.action).toHaveBeenCalledWith({
      homepage: "example.com",
      locale: "de",
      clientRequestId: expect.any(String),
    });
    expect(container.querySelector('[data-testid="wiki-setup-crawl-progress"]')).not.toBeNull();
  });

  it("deduplicates submission and transitions to a durable working state", async () => {
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
      locale: "en",
      clientRequestId: expect.any(String),
    });
    expect(form().getAttribute("aria-busy")).toBe("true");
    expect(input().disabled).toBe(true);
    expect(button("WikiSetup.start").disabled).toBe(true);
    expect(button("OnboardingWizard.wiki.skip").disabled).toBe(true);

    await act(async () => {
      resolve({
        ok: true,
        data: {
          homepage: "https://example.com/",
          domain: "example.com",
        },
      });
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="wiki-setup-crawl-progress"]')).not.toBeNull();
    expect(container.textContent).toContain("WikiSetup.status.workingTitle");
    expect(container.textContent).toContain("example.com");
    expect(container.querySelector("form")).toBeNull();
    expect(harness.refresh).toHaveBeenCalledOnce();

    act(() => button("WikiSetup.continueBackground").click());
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows which onboarding action is still completing", () => {
    render(
      {
        status: "working",
        homepage: "https://example.com/",
        domain: "example.com",
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
    expect(button("OnboardingWizard.wiki.skip").disabled).toBe(true);
    expect(button("OnboardingWizard.wiki.skip").querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("lists the completed page names", () => {
    render({
      status: "completed",
      homepage: "https://example.com/",
      domain: "example.com",
      pages: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "Company Overview",
          kind: "knowledge" as const,
          whenToUse: null,

          createdAt: new Date("2026-09-22T00:00:00.000Z"),
          updatedAt: new Date("2026-09-22T00:00:00.000Z"),
        },
      ],
    });

    expect(container.textContent).toContain("WikiSetup.status.completedBodyOnboarding");
    expect(container.textContent).toContain("Company Overview");
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).not.toContain("WikiSetup.tryAnother");
  });

  it("keeps a partial import visible without offering an empty-Wiki retry that cannot run", () => {
    render({
      status: "failed",
      homepage: "https://example.com/",
      domain: "example.com",
      pages: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "Imported knowledge",
          kind: "knowledge",
          whenToUse: null,

          createdAt: new Date("2026-09-29"),
          updatedAt: new Date("2026-09-29"),
        },
      ],
    });
    expect(container.textContent).not.toContain("WikiSetup.tryAnother");
    expect(button("WikiSetup.continue").disabled).toBe(false);
  });

  it("focuses the homepage field when retry opens and hides retry when setup is unavailable", () => {
    const failed = {
      status: "failed" as const,
      homepage: "https://example.com/",
      domain: "example.com",
      pages: [],
    };
    render(failed);
    act(() => button("WikiSetup.tryAnother").click());
    expect(document.activeElement).toBe(input());

    render(failed, { canStart: false });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("WikiSetup.status.failedBody");
    expect(container.textContent).not.toContain("WikiSetup.tryAnother");
    expect(container.textContent).toContain("WikiSetup.continue");
  });

  it("shows a neutral zero-page result with a retry", () => {
    render({
      status: "noContent",
      homepage: "https://example.com/",
      domain: "example.com",
      pages: [],
    });

    expect(container.textContent).toContain("WikiSetup.status.noContentTitle");
    expect(container.textContent).toContain("WikiSetup.status.noContentBody");
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
