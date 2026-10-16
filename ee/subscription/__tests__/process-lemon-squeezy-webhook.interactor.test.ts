import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    BETTER_AUTH_SECRET: "process-webhook-test-secret",
    RESEND_OPERATOR_EMAIL: "operator@example.invalid",
  },
}));

const { ProcessLemonSqueezyWebhookInteractor } = await import("../process-lemon-squeezy-webhook.interactor");
const { signCheckoutWorkspace } = await import("../checkout-workspace-signature");
const { UNSIGNED_CHECKOUT_CLAIMS_END } = await import("../unsigned-checkout-claims");

type Workspace = {
  companyId: string;
  name: string | null;
  status: string;
  plan: string;
  lemonSqueezyId: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const BEFORE_END = new Date(UNSIGNED_CHECKOUT_CLAIMS_END.getTime() - HOUR_MS);
const AFTER_END = new Date(UNSIGNED_CHECKOUT_CLAIMS_END.getTime() + HOUR_MS);

function signed(companyId: string) {
  return { companyId, signature: signCheckoutWorkspace(companyId, "process-webhook-test-secret") };
}

function unsigned(companyId: string) {
  return { companyId, signature: null };
}

function event(
  subscriptionId: string,
  claim: { companyId: string; signature: string | null } | null,
  subscriptionCreatedAt: Date | null = AFTER_END,
) {
  return { eventName: "subscription_created", subscriptionId, subscriptionCreatedAt, claim };
}

function providerSubscription(id: string, status: string, createdAt: string) {
  return { data: { id, attributes: { status, created_at: createdAt } } };
}

function setup(options: {
  workspaces?: Workspace[];
  provider?: ReturnType<typeof providerSubscription>[];
  synced?: { companyId: string; changedPlan: string | null } | null;
}) {
  const workspaces = options.workspaces ?? [];
  const provider = options.provider ?? [];
  const repo = {
    findWorkspaceBillingUnscoped: vi.fn((companyId: string) =>
      Promise.resolve(workspaces.find((workspace) => workspace.companyId === companyId) ?? null),
    ),
    findWorkspaceBillingBySubscriptionIdUnscoped: vi.fn((subscriptionId: string) =>
      Promise.resolve(workspaces.find((workspace) => workspace.lemonSqueezyId === subscriptionId) ?? null),
    ),
  };
  const subscriptionService = {
    getSubscriptionOrThrowUnscoped: vi.fn((id: string) => {
      const found = provider.find((subscription) => subscription.data.id === id);
      return found ? Promise.resolve(found) : Promise.reject(new Error(`Failed to get subscription ${id}`));
    }),
    syncSubscription: vi.fn((workspace: Workspace) =>
      Promise.resolve(
        options.synced === undefined ? { companyId: workspace.companyId, changedPlan: null } : options.synced,
      ),
    ),
  };
  const deleteAccountsForPlan = { invoke: vi.fn().mockResolvedValue(undefined) };
  const emailService = { send: vi.fn().mockResolvedValue(true) };
  const interactor = new ProcessLemonSqueezyWebhookInteractor(
    repo as never,
    subscriptionService as never,
    deleteAccountsForPlan as never,
    emailService as never,
  );
  const mails = () =>
    emailService.send.mock.calls.map(([args]) => ({
      to: args.to as string,
      subject: args.subject as string,
      props: (args.react as { props: Record<string, unknown> }).props,
    }));

  return { interactor, repo, subscriptionService, deleteAccountsForPlan, emailService, mails };
}

const unbound: Workspace = {
  companyId: "company-1",
  name: "Bergmann",
  status: "expired",
  plan: "pro",
  lemonSqueezyId: null,
};

beforeEach(() => vi.clearAllMocks());

describe("an event for a subscription a workspace already holds", () => {
  it("updates the holding workspace and ignores another workspace the event names", async () => {
    const bound = { ...unbound, status: "active", lemonSqueezyId: "sub-1" };
    const incoming = providerSubscription("sub-1", "active", "2026-10-01T00:00:00.000000Z");
    const { interactor, subscriptionService, repo, mails } = setup({ workspaces: [bound], provider: [incoming] });

    const result = await interactor.invoke(event("sub-1", signed("company-2")));

    expect(result).toEqual({ applied: true });
    expect(subscriptionService.syncSubscription).toHaveBeenCalledExactlyOnceWith(bound, incoming);
    expect(repo.findWorkspaceBillingUnscoped).not.toHaveBeenCalled();
    expect(mails()).toEqual([]);
  });

  it("enforces the plan's account caps when the sync changed the plan", async () => {
    const bound = { ...unbound, status: "active", lemonSqueezyId: "sub-1" };
    const { interactor, deleteAccountsForPlan } = setup({
      workspaces: [bound],
      provider: [providerSubscription("sub-1", "active", "2026-10-01T00:00:00.000000Z")],
      synced: { companyId: "company-1", changedPlan: "starter" },
    });

    await interactor.invoke(event("sub-1", null));

    expect(deleteAccountsForPlan.invoke).toHaveBeenCalledExactlyOnceWith({ companyId: "company-1", plan: "starter" });
  });

  it("fails so the provider retries when the binding changed while the event was processed", async () => {
    const bound = { ...unbound, status: "active", lemonSqueezyId: "sub-1" };
    const { interactor, mails } = setup({
      workspaces: [bound],
      provider: [providerSubscription("sub-1", "active", "2026-10-01T00:00:00.000000Z")],
      synced: null,
    });

    await expect(interactor.invoke(event("sub-1", null))).rejects.toThrow(/binding changed/);
    expect(mails()).toEqual([]);
  });
});

describe("a signed workspace claim", () => {
  it("binds a new subscription to the signed workspace when it holds none", async () => {
    const incoming = providerSubscription("sub-1", "active", "2026-10-16T09:00:00.000000Z");
    const { interactor, subscriptionService, mails } = setup({ workspaces: [unbound], provider: [incoming] });

    const result = await interactor.invoke(event("sub-1", signed("company-1")));

    expect(result).toEqual({ applied: true });
    expect(subscriptionService.syncSubscription).toHaveBeenCalledExactlyOnceWith(unbound, incoming);
    expect(mails()).toEqual([]);
  });

  it.each(["expired", "cancelled", "unPaid"])(
    "replaces a binding whose subscription is %s without telling the operator",
    async (status) => {
      const lapsed = { ...unbound, status, lemonSqueezyId: "sub-0" };
      const incoming = providerSubscription("sub-1", "active", "2026-10-16T09:00:00.000000Z");
      const { interactor, subscriptionService, mails } = setup({ workspaces: [lapsed], provider: [incoming] });

      expect(await interactor.invoke(event("sub-1", signed("company-1")))).toEqual({ applied: true });

      expect(subscriptionService.syncSubscription).toHaveBeenCalledExactlyOnceWith(lapsed, incoming);
      expect(mails()).toEqual([]);
    },
  );

  it("binds nothing and tells the operator when the signed workspace no longer exists", async () => {
    const { interactor, subscriptionService, mails } = setup({});

    const result = await interactor.invoke(event("sub-1", signed("deleted-company")));

    expect(result).toEqual({ applied: false });
    expect(subscriptionService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
    expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
    expect(mails()).toEqual([
      {
        to: "operator@example.invalid",
        subject: "Lemon Squeezy subscription for a missing workspace",
        props: expect.objectContaining({
          reason: "workspaceMissing",
          eventName: "subscription_created",
          subscriptionId: "sub-1",
          workspaceId: "deleted-company",
          workspaceName: null,
          otherSubscriptionId: null,
          locale: "en",
        }),
      },
    ]);
  });

  it.each([
    ["a signature of another workspace", signCheckoutWorkspace("company-2", "process-webhook-test-secret")],
    ["a signature made with another secret", signCheckoutWorkspace("company-1", "another-secret")],
    ["a malformed signature", "not-a-signature"],
    [
      "an upper-case copy of the signature",
      signCheckoutWorkspace("company-1", "process-webhook-test-secret").toUpperCase(),
    ],
  ])("binds nothing and tells the operator about %s", async (_, signature) => {
    const { interactor, subscriptionService, mails } = setup({ workspaces: [unbound] });

    const result = await interactor.invoke(event("sub-1", { companyId: "company-1", signature }));

    expect(result).toEqual({ applied: false });
    expect(subscriptionService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
    expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
    expect(mails()).toEqual([
      expect.objectContaining({
        subject: "Forged workspace in a Lemon Squeezy subscription",
        props: expect.objectContaining({ reason: "forged", workspaceId: "company-1", workspaceName: "Bergmann" }),
      }),
    ]);
  });
});

describe("a second subscription for a workspace with a live one", () => {
  it.each(["active", "trial", "pastDue"])(
    "binds the newest paid subscription over a %s one and asks the operator to refund the old one",
    async (status) => {
      const live = { ...unbound, status, lemonSqueezyId: "sub-old" };
      const old = providerSubscription("sub-old", "active", "2026-10-01T00:00:00.000000Z");
      const newest = providerSubscription("sub-new", "active", "2026-10-16T09:00:00.000000Z");
      const { interactor, subscriptionService, mails } = setup({ workspaces: [live], provider: [old, newest] });

      const result = await interactor.invoke(event("sub-new", signed("company-1")));

      expect(result).toEqual({ applied: true });
      expect(subscriptionService.syncSubscription).toHaveBeenCalledExactlyOnceWith(live, newest);
      expect(mails()).toEqual([
        {
          to: "operator@example.invalid",
          subject: "Workspace moved to its newest subscription",
          props: expect.objectContaining({
            reason: "replaced",
            subscriptionId: "sub-new",
            otherSubscriptionId: "sub-old",
            workspaceId: "company-1",
            workspaceName: "Bergmann",
          }),
        },
      ]);
    },
  );

  it("keeps the newer binding when an event of the older subscription arrives and tells the operator", async () => {
    const live = { ...unbound, status: "active", lemonSqueezyId: "sub-new" };
    const old = providerSubscription("sub-old", "active", "2026-10-01T00:00:00.000000Z");
    const newest = providerSubscription("sub-new", "active", "2026-10-16T09:00:00.000000Z");
    const { interactor, subscriptionService, mails } = setup({ workspaces: [live], provider: [old, newest] });

    const result = await interactor.invoke(event("sub-old", signed("company-1")));

    expect(result).toEqual({ applied: false });
    expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
    expect(mails()).toEqual([
      expect.objectContaining({
        subject: "Second subscription for a workspace",
        props: expect.objectContaining({
          reason: "duplicate",
          subscriptionId: "sub-old",
          otherSubscriptionId: "sub-new",
        }),
      }),
    ]);
  });

  it.each(["cancelled", "expired", "unpaid", "paused"])(
    "keeps the live binding when the newer subscription is already %s",
    async (status) => {
      const live = { ...unbound, status: "active", lemonSqueezyId: "sub-old" };
      const old = providerSubscription("sub-old", "active", "2026-10-01T00:00:00.000000Z");
      const newest = providerSubscription("sub-new", status, "2026-10-16T09:00:00.000000Z");
      const { interactor, subscriptionService, mails } = setup({ workspaces: [live], provider: [old, newest] });

      expect(await interactor.invoke(event("sub-new", signed("company-1")))).toEqual({ applied: false });

      expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
      expect(mails().map((mail) => mail.props.reason)).toEqual(["duplicate"]);
    },
  );

  it("sends no operator e-mail when binding the newest subscription fails and the provider retries", async () => {
    const live = { ...unbound, status: "active", lemonSqueezyId: "sub-old" };
    const { interactor, mails } = setup({
      workspaces: [live],
      provider: [
        providerSubscription("sub-old", "active", "2026-10-01T00:00:00.000000Z"),
        providerSubscription("sub-new", "active", "2026-10-16T09:00:00.000000Z"),
      ],
      synced: null,
    });

    await expect(interactor.invoke(event("sub-new", signed("company-1")))).rejects.toThrow(/binding changed/);
    expect(mails()).toEqual([]);
  });
});

describe("an unsigned workspace claim", () => {
  it("binds a subscription created before the end of the transition to a workspace without a live binding", async () => {
    const incoming = providerSubscription("sub-1", "active", BEFORE_END.toISOString());
    const { interactor, subscriptionService, mails } = setup({ workspaces: [unbound], provider: [incoming] });

    const result = await interactor.invoke(event("sub-1", unsigned("company-1"), BEFORE_END));

    expect(result).toEqual({ applied: true });
    expect(subscriptionService.syncSubscription).toHaveBeenCalledExactlyOnceWith(unbound, incoming);
    expect(mails()).toEqual([]);
  });

  it.each([
    ["created after the transition ended", AFTER_END],
    ["without a creation time", null],
  ])("binds nothing for a subscription %s and tells the operator", async (_, createdAt) => {
    const { interactor, subscriptionService, mails } = setup({ workspaces: [unbound] });

    const result = await interactor.invoke(event("sub-1", unsigned("company-1"), createdAt));

    expect(result).toEqual({ applied: false });
    expect(subscriptionService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
    expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
    expect(mails()).toEqual([
      expect.objectContaining({
        subject: "Unsigned workspace in a Lemon Squeezy subscription",
        props: expect.objectContaining({ reason: "unsigned", workspaceId: "company-1", workspaceName: "Bergmann" }),
      }),
    ]);
  });

  it.each(["active", "trial", "pastDue"])(
    "binds nothing during the transition when the workspace already has a %s binding",
    async (status) => {
      const live = { ...unbound, status, lemonSqueezyId: "sub-0" };
      const { interactor, subscriptionService, mails } = setup({ workspaces: [live] });

      const result = await interactor.invoke(event("sub-1", unsigned("company-1"), BEFORE_END));

      expect(result).toEqual({ applied: false });
      expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
      expect(mails().map((mail) => mail.props.reason)).toEqual(["unsigned"]);
    },
  );

  it("binds nothing during the transition for a workspace that does not exist", async () => {
    const { interactor, mails } = setup({});

    expect(await interactor.invoke(event("sub-1", unsigned("unknown-company"), BEFORE_END))).toEqual({
      applied: false,
    });
    expect(mails()).toEqual([
      expect.objectContaining({
        props: expect.objectContaining({ reason: "unsigned", workspaceId: "unknown-company", workspaceName: null }),
      }),
    ]);
  });
});

describe("an event that names no workspace", () => {
  it("binds nothing, asks the provider nothing and tells the operator", async () => {
    const { interactor, subscriptionService, mails } = setup({ workspaces: [unbound] });

    const result = await interactor.invoke(event("sub-1", null));

    expect(result).toEqual({ applied: false });
    expect(subscriptionService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
    expect(mails()).toEqual([
      {
        to: "operator@example.invalid",
        subject: "Lemon Squeezy subscription without a workspace",
        props: expect.objectContaining({ reason: "unclaimed", subscriptionId: "sub-1", workspaceId: null }),
      },
    ]);
  });
});
