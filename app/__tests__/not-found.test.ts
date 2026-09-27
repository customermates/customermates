import type { ReactElement } from "react";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLocale: vi.fn(),
  getMessages: vi.fn(),
  resolveRequestAccountState: vi.fn(),
}));

vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: mocks.resolveRequestAccountState,
}));
vi.mock("next-intl/server", () => ({ getLocale: mocks.getLocale, getMessages: mocks.getMessages }));
vi.mock("../root-document", () => ({ RootDocument: () => null }));
vi.mock("../components/navigation/marketing-shell", () => ({ MarketingShell: () => null }));
vi.mock("@/components/shared/not-found-page-view", () => ({ NotFoundPageView: () => null }));

import GlobalNotFoundPage from "../global-not-found";
import NotFoundPage from "../not-found";
import LocaleNotFoundPage from "../[locale]/not-found";
import { RootDocument } from "../root-document";
import { MarketingShell } from "../components/navigation/marketing-shell";

import { NotFoundPageView } from "@/components/shared/not-found-page-view";

type Element<Props> = ReactElement<Props & { children: ReactElement }>;
type Shell = Element<{ accountState?: string }>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLocale.mockResolvedValue("de");
  mocks.getMessages.mockImplementation((options?: { locale?: string }) =>
    Promise.resolve({ NotFoundPage: { title: options?.locale ?? "request" } }),
  );
  mocks.resolveRequestAccountState.mockResolvedValue({ state: "allowed", user: null });
});

describe("global not-found page", () => {
  it("renders an unmatched URL in the request's locale with the visitor's account state, without shipping the store", async () => {
    const page = (await GlobalNotFoundPage()) as Element<{ displayLanguage: string; messages: unknown }>;
    const shell = page.props.children as Shell;

    expect(page.type).toBe(RootDocument);
    expect(page.props.displayLanguage).toBe("de");
    expect(page.props.messages).toEqual({ NotFoundPage: { title: "request" } });
    expect(shell.type).toBe(MarketingShell);
    expect(shell.props.accountState).toBe("allowed");
    expect(shell.props.children.type).toBe(NotFoundPageView);
  });
});

describe("root not-found boundary", () => {
  it("reads nothing from the request, because Next renders it into every page and would make each one dynamic", async () => {
    const page = (await NotFoundPage()) as Element<{ displayLanguage: string; messages: unknown }>;
    const shell = page.props.children as Shell;

    expect(page.props.displayLanguage).toBe("en");
    expect(page.props.messages).toEqual({ NotFoundPage: { title: "en" } });
    expect(shell.props.accountState).toBeUndefined();
    expect((shell.props.children as Element<{ locale: string }>).props.locale).toBe("en");
    expect(mocks.getLocale).not.toHaveBeenCalled();
    expect(mocks.resolveRequestAccountState).not.toHaveBeenCalled();
  });

  it("lets a locale route's notFound() keep its locale and resolve the navbar on the client", () => {
    const page = LocaleNotFoundPage() as Shell;

    expect(page.type).toBe(MarketingShell);
    expect(page.props.accountState).toBeUndefined();
    expect(page.props.children.type).toBe(NotFoundPageView);
  });
});
