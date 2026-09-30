import { beforeEach, describe, expect, it, vi } from "vitest";
import { presetId } from "@/features/records/crm-preset";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  requireAccess: vi.fn(),
  resolveAccountState: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("@/features/auth/next/require", () => ({ requireAccess: mocks.requireAccess }));
vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: mocks.resolveAccountState,
}));

type DetailPage = (props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => Promise<unknown>;

const companyId = "10000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000001";
const pages: Array<{
  kind: "contact" | "organization" | "deal" | "service" | "task";
  load: () => Promise<{ default: DetailPage }>;
}> = [
  { kind: "contact", load: () => import("../contacts/[id]/page") },
  { kind: "organization", load: () => import("../organizations/[id]/page") },
  { kind: "deal", load: () => import("../deals/[id]/page") },
  { kind: "service", load: () => import("../services/[id]/page") },
  { kind: "task", load: () => import("../tasks/[id]/page") },
];

describe("legacy record detail links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccess.mockResolvedValue(undefined);
    mocks.resolveAccountState.mockResolvedValue({ user: { companyId } });
  });

  it.each(pages)("redirects a $kind detail to its stable generic type and retains its view", async ({ kind, load }) => {
    const page = (await load()).default;
    await expect(
      page({
        params: Promise.resolve({ id: recordId }),
        searchParams: Promise.resolve({ view: "__all__", viewSurface: "entity-timeline", filter: ["a", "b"] }),
      }),
    ).rejects.toThrow("redirect:");

    expect(mocks.requireAccess).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledOnce();
    const destination = mocks.redirect.mock.calls[0][0];
    const url = new URL(destination, "http://localhost");
    expect(url.pathname).toBe(`/en/records/${presetId(companyId, kind)}/${recordId}`);
    expect(url.searchParams.get("view")).toBe("__all__");
    expect(url.searchParams.get("viewSurface")).toBe("entity-timeline");
    expect(url.searchParams.getAll("filter")).toEqual(["a", "b"]);
  });

  it("rejects a malformed legacy record id before redirecting", async () => {
    const page = (await import("../contacts/[id]/page")).default;
    await expect(
      page({ params: Promise.resolve({ id: "not-a-uuid" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("not found");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("requires an authenticated workspace before redirecting", async () => {
    mocks.resolveAccountState.mockResolvedValue({ user: null });
    const page = (await import("../deals/[id]/page")).default;
    await expect(
      page({ params: Promise.resolve({ id: recordId }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("not found");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
