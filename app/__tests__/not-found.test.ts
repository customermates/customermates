import type { ReactElement } from "react";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: () => Promise.resolve({ state: "allowed", user: null }),
}));
vi.mock("../components/navigation/marketing-shell", () => ({ MarketingShell: () => null }));
vi.mock("@/components/shared/not-found-page-view", () => ({ NotFoundPageView: () => null }));

import NotFoundPage from "../not-found";
import { MarketingShell } from "../components/navigation/marketing-shell";

import { NotFoundPageView } from "@/components/shared/not-found-page-view";

describe("root not-found page", () => {
  it("renders an unmatched URL inside the marketing shell with the visitor's account state, so it keeps a navbar without shipping the store", async () => {
    const page = (await NotFoundPage()) as ReactElement<{ accountState: string; children: ReactElement }>;

    expect(page.type).toBe(MarketingShell);
    expect(page.props.accountState).toBe("allowed");
    expect(page.props.children.type).toBe(NotFoundPageView);
  });
});
