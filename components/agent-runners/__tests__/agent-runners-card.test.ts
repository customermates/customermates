import type { ListedAgentRunner } from "@/features/agent-runners/get-agent-runners.interactor";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  canManage: true,
  canRevoke: true,
  items: [] as unknown[],
  add: vi.fn(),
  setItems: vi.fn(),
  revoke: vi.fn(),
  showConfirmation: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string>) => (values ? `${key}:${Object.values(values).join(",")}` : key),
      { rich: (key: string) => key },
    ),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    agentRunnersStore: {
      canManage: harness.canManage,
      canRevoke: harness.canRevoke,
      hasLiveRunner: true,
      refresh: vi.fn(),
      items: harness.items,
      setItems: harness.setItems,
      revoke: harness.revoke,
    },
    agentRunnerModalStore: { add: harness.add },
  }),
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumericalShortDateTime: (date: Date) => `at ${date.toISOString()}` }),
}));

vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showConfirmation: harness.showConfirmation }),
}));

vi.mock("../agent-runner-modal", () => ({ AgentRunnerModal: () => createElement("div", { "data-modal": true }) }));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: (props: Record<string, unknown>) => createElement("a", props),
}));

import { AgentRunnersCard } from "../agent-runners-card";

const RUNNER_ID = "44444444-4444-4444-8444-444444444444";

function runner(overrides: Partial<ListedAgentRunner> = {}): ListedAgentRunner {
  return {
    createdByName: "Ada Owner",
    id: RUNNER_ID,
    name: "Office laptop",
    machine: "ws-main",
    clients: [{ name: "claude", version: "2.1.318" }],
    lastSeenAt: "2026-11-17T09:00:00.000Z",
    online: true,
    revokedAt: null,
    createdById: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-11-16T10:00:00.000Z",
    ...overrides,
  };
}

function render(runners: ListedAgentRunner[] | null) {
  harness.items = runners ?? [];
  return renderToStaticMarkup(createElement(AgentRunnersCard, { runners }));
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.canManage = true;
  harness.canRevoke = true;
  harness.items = [];
});

describe("AgentRunnersCard", () => {
  it("explains what a runner is and offers to add one when there is none", () => {
    const html = render([]);

    expect(html).toContain("Runners.computersTitle");
    expect(html).toContain("Runners.description");
    expect(html).toContain("Runners.add");
    expect(html).not.toContain("data-agent-runner=");
  });

  it("says that the member has no runner yet instead of showing nothing", () => {
    const html = render([]);

    expect(html).toContain("data-agent-runners-empty");
    expect(html).toContain("Runners.empty");
    expect(html).not.toContain("Runners.withheld");
    expect(render([runner()])).not.toContain("Runners.empty");
  });

  it("says that the list was withheld when the member's role may not see runners", () => {
    const html = render(null);

    expect(html).toContain("data-agent-runners-withheld");
    expect(html).toContain("Runners.withheld");
    expect(html).not.toContain("Runners.empty");
  });

  it("names the member who added a runner, and leaves the line out when that is not known", () => {
    const html = render([runner(), runner({ id: "b", name: "orphan", createdByName: null })]);

    expect(html.match(/Runners\.owner/g)).toHaveLength(1);
    expect(html).toContain('<span data-agent-runner-owner="">· Runners.owner Ada Owner</span>');
  });

  it("shows name, status, machine, CLIs with versions and the start command of each runner", () => {
    const html = render([runner()]);

    expect(html).toContain("Office laptop");
    expect(html).toContain("Runners.status.online");
    expect(html).toContain("ws-main");
    expect(html).toContain("Runners.clientNames.claude 2.1.318");
    expect(html).toContain("Runners.startCommand");
    expect(html).toContain('data-status="online"');
  });

  it("says since when an offline runner has been away", () => {
    const html = render([runner({ online: false })]);

    expect(html).toContain("Runners.offlineSince:at 2026-11-17T09:00:00.000Z");
  });

  it("marks an offline, a never connected and a revoked runner", () => {
    const html = render([
      runner({ id: "a", name: "stale", online: false }),
      runner({ id: "b", name: "fresh", online: false, lastSeenAt: null, machine: null, clients: [] }),
      runner({ id: "c", name: "gone", online: false, revokedAt: "2026-11-17T09:30:00.000Z" }),
    ]);

    expect(html).toContain('data-status="offline"');
    expect(html).toContain('data-status="neverSeen"');
    expect(html).toContain('data-status="revoked"');
    expect(html).toContain("Runners.status.neverSeen");
    expect(html).toContain("Runners.noClients");
  });

  it("offers the Revoke menu for a runner that is not revoked and not for one that is", () => {
    const html = render([runner(), runner({ id: "c", name: "gone", revokedAt: "2026-11-17T09:30:00.000Z" })]);

    expect(html.match(/data-item-actions-trigger=""/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Runners.actions:Office laptop"');
  });

  it("shows neither Add runner nor the Revoke menu to a member who may neither create nor delete", () => {
    harness.canManage = false;
    harness.canRevoke = false;

    const html = render([runner()]);

    expect(html).not.toContain("Runners.add<");
    expect(html).not.toContain("data-item-actions-trigger");
    expect(html).toContain("Office laptop");
  });

  it("offers the Revoke menu by the delete permission, as the server checks it, not by the create permission", () => {
    harness.canManage = true;
    harness.canRevoke = false;
    const createOnly = render([runner()]);

    harness.canManage = false;
    harness.canRevoke = true;
    const deleteOnly = render([runner()]);

    expect(createOnly).toContain("Runners.add<");
    expect(createOnly).not.toContain("data-item-actions-trigger");
    expect(deleteOnly).not.toContain("Runners.add<");
    expect(deleteOnly).toContain("data-item-actions-trigger");
  });

  it("never puts a token or a token hash on the page", () => {
    const html = render([runner()]);

    expect(html).not.toMatch(/cmr_[A-Za-z0-9_-]{20,}/u);
    expect(html).not.toContain("tokenHash");
  });
});
