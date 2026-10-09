import type { Root } from "react-dom/client";
import type { AccountState } from "@/features/auth/account-state";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readAccountState: vi.fn(), report: vi.fn() }));

vi.mock("@/app/[locale]/actions", () => ({ readMarketingAccountAction: mocks.readAccountState }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: mocks.report }));

import { useMarketingAccountState } from "../use-marketing-account-state";

import { SESSION_HINT_COOKIE_NAME } from "@/features/auth/session-hint";

const PROFILE = { avatarUrl: null, email: "anna@example.com", name: "Anna Müller" };

type Snapshot = ReturnType<typeof useMarketingAccountState>;

let root: Root;
let container: HTMLDivElement;
let latest: Snapshot | null = null;

function Probe({ known, enabled, pathname }: { known?: AccountState; enabled: boolean; pathname: string }) {
  latest = useMarketingAccountState(known, enabled, pathname);
  return null;
}

async function render(props: { known?: AccountState; enabled?: boolean; pathname?: string } = {}) {
  await act(async () => {
    root.render(
      createElement(Probe, { enabled: props.enabled ?? true, known: props.known, pathname: props.pathname ?? "/" }),
    );
    await Promise.resolve();
  });
  return latest as Snapshot;
}

function clearCookies() {
  for (const entry of document.cookie.split(";")) {
    const name = entry.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
}

beforeEach(() => {
  clearCookies();
  mocks.readAccountState.mockReset();
  mocks.report.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  latest = null;
});

describe("useMarketingAccountState", () => {
  it("treats a browser without the session hint as signed out and never calls the server", async () => {
    expect((await render()).accountState).toBe("unauthenticated");
    expect(mocks.readAccountState).not.toHaveBeenCalled();
  });

  it("asks the server for the account state once the session hint is present", async () => {
    document.cookie = `${SESSION_HINT_COOKIE_NAME}=1; Path=/`;
    mocks.readAccountState.mockResolvedValue({ state: "allowed", profile: PROFILE });

    const snapshot = await render();
    expect(snapshot.accountState).toBe("allowed");
    expect(snapshot.profile).toStrictEqual(PROFILE);
    expect(mocks.readAccountState).toHaveBeenCalledOnce();
  });

  it("skips the lookup where the shell shows no account actions", async () => {
    document.cookie = `${SESSION_HINT_COOKIE_NAME}=1; Path=/`;

    expect((await render({ enabled: false })).accountState).toBe("unauthenticated");
    expect(mocks.readAccountState).not.toHaveBeenCalled();
  });

  it("uses a server-resolved state as given and still loads the profile for the avatar", async () => {
    document.cookie = `${SESSION_HINT_COOKIE_NAME}=1; Path=/`;
    mocks.readAccountState.mockResolvedValue({ state: "allowed", profile: PROFILE });

    const snapshot = await render({ known: "pending" });
    expect(snapshot.accountState).toBe("pending");
    expect(snapshot.profile).toStrictEqual(PROFILE);
  });

  it("drops back to signed out and clears the hint after signing out", async () => {
    document.cookie = `${SESSION_HINT_COOKIE_NAME}=1; Path=/`;
    mocks.readAccountState.mockResolvedValue({ state: "allowed", profile: PROFILE });
    const signedIn = await render();

    act(() => signedIn.markSignedOut());

    expect(latest?.accountState).toBe("unauthenticated");
    expect(latest?.profile).toBeNull();
    expect(document.cookie).not.toContain(`${SESSION_HINT_COOKIE_NAME}=`);
  });

  it("rechecks on navigation, so a sign-out that redirected elsewhere shows the signed-out navbar", async () => {
    document.cookie = `${SESSION_HINT_COOKIE_NAME}=1; Path=/`;
    mocks.readAccountState.mockResolvedValue({ state: "allowed", profile: PROFILE });
    expect((await render({ pathname: "/pricing" })).accountState).toBe("allowed");

    document.cookie = `${SESSION_HINT_COOKIE_NAME}=; Path=/; Max-Age=0`;

    expect((await render({ pathname: "/" })).accountState).toBe("unauthenticated");
    expect(mocks.readAccountState).toHaveBeenCalledOnce();
  });

  it("reports a failed lookup and keeps the signed-out navbar", async () => {
    document.cookie = `${SESSION_HINT_COOKIE_NAME}=1; Path=/`;
    const failure = new Error("offline");
    mocks.readAccountState.mockRejectedValue(failure);

    expect((await render()).accountState).toBe("unauthenticated");
    expect(mocks.report).toHaveBeenCalledWith(failure);
  });
});
