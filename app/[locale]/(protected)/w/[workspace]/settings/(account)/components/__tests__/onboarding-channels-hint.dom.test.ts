import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  connectAccount: vi.fn(),
  canConnect: true,
  search: "from=onboarding",
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(harness.search) }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never),
}));

import { OnboardingChannelsHint } from "../onboarding-channels-hint";
import { ONBOARDING_CONNECT_STORAGE_KEY, readOnboardingConnect } from "../onboarding-connect-return";

let container: HTMLDivElement;
let root: Root;

async function renderHint() {
  harness.rootStore = {
    connectedAccountsStore: { connectAccount: harness.connectAccount },
    userStore: { can: () => harness.canConnect },
  };
  await act(async () => {
    root.render(createElement(OnboardingChannelsHint));
    await Promise.resolve();
  });
}

function click(id: string) {
  const found = container.querySelector<HTMLButtonElement>(`#${id}`);
  if (!found) throw new Error(`Button ${id} did not render.`);
  act(() => found.click());
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.canConnect = true;
  harness.search = "from=onboarding";
  window.sessionStorage.clear();
  harness.connectAccount.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("OnboardingChannelsHint", () => {
  it("puts LinkedIn first as the recommended connection, with email as the alternative", async () => {
    await renderHint();

    const buttons = [...container.querySelectorAll("button")].map((button) => button.id);
    expect(buttons).toEqual([
      "onboarding-connect-linkedin",
      "onboarding-connect-sales-navigator",
      "onboarding-connect-google",
      "onboarding-connect-outlook",
      "onboarding-connect-imap",
    ]);
    expect(container.querySelector("h2")?.textContent).toBe("OnboardingWizard.goal.channelsHint.title");
    expect(container.textContent).toContain("OnboardingWizard.goal.channelsHint.recommended");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/dashboard");

    click("onboarding-connect-linkedin");
    click("onboarding-connect-sales-navigator");
    click("onboarding-connect-google");
    expect(harness.connectAccount.mock.calls).toEqual([["linkedin"], ["linkedin_sales_navigator"], ["google"]]);
    expect(readOnboardingConnect()).toBe("google");
    expect(window.sessionStorage.getItem(ONBOARDING_CONNECT_STORAGE_KEY)).toContain('"channel":"google"');
  });

  it("stays hidden on the plain Channels page", async () => {
    harness.search = "";
    await renderHint();

    expect(container.innerHTML).toBe("");
  });

  it("confirms the first connection and leads on to the dashboard and the inbox", async () => {
    harness.search = "from=onboarding&connected=linkedin";
    await renderHint();

    const connected = container.querySelector("#onboarding-channel-connected");
    expect(connected?.getAttribute("role")).toBe("status");
    expect(connected?.textContent).toContain("OnboardingWizard.goal.channelsHint.connectedLinkedinTitle");
    expect(connected?.textContent).toContain("OnboardingWizard.goal.channelsHint.connectedDescription");
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect([...container.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard",
      "/inbox",
    ]);
  });

  it("names email for a connected mailbox", async () => {
    harness.search = "from=onboarding&connected=outlook";
    await renderHint();

    expect(container.textContent).toContain("OnboardingWizard.goal.channelsHint.connectedEmailTitle");
  });

  it("ignores an unknown connected channel and keeps offering the connections", async () => {
    harness.search = "from=onboarding&connected=fax";
    await renderHint();

    expect(container.querySelector("#onboarding-channel-connected")).toBeNull();
    expect(container.querySelector("#onboarding-connect-linkedin")).not.toBeNull();
  });

  it("keeps only the way to the dashboard for members who cannot connect channels", async () => {
    harness.canConnect = false;
    await renderHint();

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/dashboard");
  });
});
