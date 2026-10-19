import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";
import type { WikiPageProposalReviewItem } from "@/features/wiki/wiki-page-proposal.schema";

import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ list: vi.fn(), approve: vi.fn(), reject: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("../../actions", () => ({
  getWikiPageProposalsAction: harness.list,
  approveWikiPageProposalAction: harness.approve,
  rejectWikiPageProposalAction: harness.reject,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumericalShortDateTime: () => "08.10.2026, 09:00" }),
}));
vi.mock("@/components/modal", () => ({
  AppModal: function AppModal({
    actions = [],
    children,
    open,
  }: {
    actions?: { id: string; label: string; disabled?: boolean; onClick: () => unknown }[];
    children?: ReactNode;
    open?: boolean;
  }) {
    return createElement(
      "aside",
      { "data-sheet-open": String(Boolean(open)) },
      ...actions.map((action) =>
        createElement(
          "button",
          { key: action.id, disabled: action.disabled, type: "button", onClick: () => void action.onClick() },
          action.label,
        ),
      ),
      children,
    );
  },
  AppModalTitle: function AppModalTitle({ children }: { children?: ReactNode }) {
    return createElement("h2", null, children);
  },
}));
vi.mock("@/components/shared/top-bar-action-buttons", () => ({
  TopBarPrimaryButton: function TopBarPrimaryButton({
    anchorId,
    count,
    label,
    onClick,
  }: {
    anchorId?: string;
    count?: number;
    label: string;
    onClick: () => void;
  }) {
    return createElement("button", { "aria-label": label, id: anchorId, type: "button", onClick }, label, count);
  },
}));

import { WikiProposals } from "../wiki-proposals";
import { WikiProposalsEntry } from "../wiki-proposals-entry";
import { WikiProposalsStore } from "../wiki-proposals.store";

const PAGE_ID = "10000000-0000-4000-8000-000000000001";
const createdAt = new Date("2026-10-08T09:00:00.000Z");
const current = {
  id: PAGE_ID,
  title: "Refunds",
  markdown: "Refund within 14 days.",
  kind: "knowledge" as const,
  whenToUse: null,
  createdAt,
  updatedAt: createdAt,
};

function proposal(overrides: Partial<WikiPageProposalReviewItem>): WikiPageProposalReviewItem {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    action: "update",
    status: "pending",
    pageId: PAGE_ID,
    title: null,
    markdown: "Refund within 30 days.",
    kind: null,
    whenToUse: null,
    baseUpdatedAt: createdAt,
    routineId: "20000000-0000-4000-8000-000000000001",
    routineName: "Weekly FAQ refresh",
    routineRunId: "30000000-0000-4000-8000-000000000001",
    conversationId: "40000000-0000-4000-8000-000000000001",
    reviewedAt: null,
    createdAt,
    updatedAt: createdAt,
    currentPage: current,
    stale: false,
    ...overrides,
  };
}

const rootStore = { localeStore: { getTranslation: (key: string) => key } } as unknown as RootStore;
const roots: Root[] = [];

function storeWith(items: WikiPageProposalReviewItem[]) {
  const store = new WikiProposalsStore(rootStore);
  runInAction(() => {
    store.items = items;
    store.total = items.length;
  });
  return store;
}

async function mount(store: WikiProposalsStore, canApply = () => true) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        Fragment,
        null,
        createElement(WikiProposalsEntry, { store }),
        createElement(WikiProposals, { store, canApply }),
      ),
    );
    await Promise.resolve();
  });
  return container;
}

function button(container: HTMLElement, label: string) {
  const match = [...container.querySelectorAll("button")].find((element) => element.textContent?.includes(label));
  if (!match) throw new Error(`No button labelled ${label}`);
  return match;
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.list.mockResolvedValue({ ok: true, data: { items: [], total: 0 } });
  harness.approve.mockResolvedValue({ ok: true, data: { ...proposal({}), status: "approved" } });
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("Knowledge Base proposals entry", () => {
  it("stays out of the toolbar while nothing waits for review", async () => {
    const container = await mount(storeWith([]));

    expect(container.querySelector("#wiki-proposals-entry")).toBeNull();
  });

  it("shows a compact entry with the pending count and lists each proposal with its routine", async () => {
    const container = await mount(
      storeWith([
        proposal({}),
        proposal({
          id: "50000000-0000-4000-8000-000000000002",
          action: "create",
          pageId: null,
          title: "Shipping",
          currentPage: null,
          routineName: null,
        }),
      ]),
    );

    const entry = container.querySelector("#wiki-proposals-entry");
    expect(entry?.getAttribute("aria-label")).toBe("Wiki.proposals.entry");
    expect(entry?.textContent).toContain("2");
    const list = container.querySelector("[data-wiki-proposal-list]");
    expect(list?.textContent).toContain("Refunds");
    expect(list?.textContent).toContain('Wiki.proposals.fromRoutine:{"routine":"Weekly FAQ refresh"}');
    expect(list?.textContent).toContain("Shipping");
    expect(list?.textContent).toContain("Wiki.proposals.fromRoutineDeleted");
  });

  it("previews the current page beside the proposed content and approves it", async () => {
    const store = storeWith([proposal({})]);
    const container = await mount(store);

    act(() => button(container, "Refunds").click());

    const preview = container.querySelector("[data-wiki-proposal-preview]");
    const current = [...(preview?.querySelectorAll('[data-wiki-proposal-side="current"]') ?? [])].map(
      (side) => side.textContent,
    );
    const proposed = [...(preview?.querySelectorAll('[data-wiki-proposal-side="proposed"]') ?? [])].map(
      (side) => side.textContent,
    );
    expect(current.join(" ")).toContain("Refund within 14 days.");
    expect(proposed.join(" ")).toContain("Refund within 30 days.");
    expect(proposed.join(" ")).toContain("Refunds");

    act(() => button(container, "Wiki.proposals.approve").click());

    await vi.waitFor(() => expect(harness.approve).toHaveBeenCalledExactlyOnceWith({ id: proposal({}).id }));
  });

  it("blocks approval of a stale proposal and of an action the reviewer's role cannot apply", async () => {
    const stale = storeWith([proposal({ stale: true })]);
    const staleView = await mount(stale);
    act(() => button(staleView, "Refunds").click());
    expect(staleView.textContent).toContain("Wiki.proposals.stale");
    expect(button(staleView, "Wiki.proposals.approve").disabled).toBe(true);
    expect(button(staleView, "Wiki.proposals.reject").disabled).toBe(false);

    const removal = storeWith([proposal({ action: "delete", markdown: null })]);
    const removalView = await mount(removal, () => false);
    act(() => button(removalView, "Refunds").click());
    expect(removalView.textContent).toContain("Wiki.proposals.deleteNotice");
    expect(removalView.textContent).toContain("Wiki.proposals.needsPermission");
    expect(button(removalView, "Wiki.proposals.approve").disabled).toBe(true);
  });
});
