import type { ReactElement } from "react";

import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("de") }));
vi.mock("../components/navigation/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/components/shared/not-found-page-view", () => ({ NotFoundPageView: () => null }));

import NotFoundPage from "../not-found";
import { AppShell } from "../components/navigation/app-shell";

import { NotFoundPageView } from "@/components/shared/not-found-page-view";

describe("root not-found page", () => {
  it("renders an unmatched URL inside the shell the account state selects, as the root layout did before it moved into the route groups", async () => {
    const page = (await NotFoundPage()) as ReactElement<{ displayLanguage: string; children: ReactElement }>;

    expect(page.type).toBe(AppShell);
    expect(page.props.displayLanguage).toBe("de");
    expect(page.props.children.type).toBe(NotFoundPageView);
  });
});
