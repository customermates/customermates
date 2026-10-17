import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    BETTER_AUTH_SECRET: "process-webhook-test-secret",
    RESEND_OPERATOR_EMAIL: "operator@example.invalid",
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

const Sentry = await import("@sentry/nextjs");
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
  return {
    kind: "subscription" as const,
    eventName: "subscription_created",
    subscriptionId,
    subscriptionCreatedAt,
    claim,
  };
}

function named(eventName: string, subscriptionId: string, claim: { companyId: string; signature: string | null }) {
  return { ...event(subscriptionId, claim), eventName };
}

function payment(subscriptionId: string, claim: { companyId: string; signature: string | null } | null) {
  return {
    kind: "payment" as const,
    eventName: "subscription_payment_success",
    subscriptionId,
    subscriptionCreatedAt: null,
    claim,
  };
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

    expect(result).toBe("applied");
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

    expect(result).toBe("applied");
    expect(subscriptionService.syncSubscription).toHaveBeenCalledExactlyOnceWith(unbound, incoming);
    expect(mails()).toEqual([]);
  });

  it.each(["expired", "cancelled", "unPaid"])(
    "replaces a binding whose subscription is %s without telling the operator",
    async (status) => {
      const lapsed = { ...unbound, status, lemonSqueezyId: "sub-0" };
      const incoming = providerSubscription("sub-1", "active", "2026-10-16T09:00:00.000000Z");
      const { interactor, subscriptionService, mails } = setup({
        workspaces: [lapsed],
        provider: [incoming, providerSubscription("sub-0", "expired", "2026-08-01T00:00:00.000000Z")],
      });

      expect(await interactor.invoke(event("sub-1", signed("company-1")))).toBe("applied");

      expect(subscriptionService.syncSubscription).toHaveBeenCalledExactlyOnceWith(lapsed, incoming);
      expect(mails()).toEqual([]);
    },
  );

  it("acknowledges a new subscription for a signed workspace that no longer exists and tells the operator", async () => {
    const { interactor, subscriptionService, mails } = setup({});

    const result = await interactor.invoke(event("sub-1", signed("deleted-company")));

    expect(result).toBe("ignored");
    expect(subscriptionService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
    expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(mails()).toEqual([
      {
        to: "operator@example.invalid",
        subject: "Lemon Squeezy payment for a missing workspace",
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

    expect(result).toBe("refused");
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

      expect(result).toBe("applied");
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

    expect(result).toBe("refused");
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

      expect(await interactor.invoke(event("sub-new", signed("company-1")))).toBe("refused");

      expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
      expect(mails().map((mail) => mail.props.reason)).toEqual(["duplicate"]);
    },
  );

  it("tells the operator once the binding moved and before the plan's caps apply", async () => {
    const live = { ...unbound, status: "active", lemonSqueezyId: "sub-old" };
    const { interactor, emailService, subscriptionService, deleteAccountsForPlan, mails } = setup({
      workspaces: [live],
      provider: [
        providerSubscription("sub-old", "active", "2026-10-01T00:00:00.000000Z"),
        providerSubscription("sub-new", "active", "2026-10-16T09:00:00.000000Z"),
      ],
      synced: { companyId: "company-1", changedPlan: "starter" },
    });

    expect(await interactor.invoke(event("sub-new", signed("company-1")))).toBe("applied");

    expect(mails().map((mail) => mail.props.reason)).toEqual(["replaced"]);
    expect(subscriptionService.syncSubscription).toHaveBeenCalledBefore(emailService.send);
    expect(emailService.send).toHaveBeenCalledBefore(deleteAccountsForPlan.invoke);
  });

  it("sends no e-mail when another delivery moved the binding first and the provider retries", async () => {
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

  it.each(["cancelled", "unPaid"])(
    "never rebinds a workspace whose newer subscription is %s to an older one",
    async (status) => {
      const newerEnded = { ...unbound, status, lemonSqueezyId: "sub-new" };
      const newest = providerSubscription(
        "sub-new",
        status === "unPaid" ? "unpaid" : "cancelled",
        "2026-10-16T09:00:00.000000Z",
      );
      const settled = setup({
        workspaces: [newerEnded],
        provider: [newest, providerSubscription("sub-old", "expired", "2026-10-01T00:00:00.000000Z")],
      });

      expect(await settled.interactor.invoke(event("sub-old", signed("company-1")))).toBe("ignored");
      expect(settled.subscriptionService.syncSubscription).not.toHaveBeenCalled();
      expect(settled.mails()).toEqual([]);

      const stillPaying = setup({
        workspaces: [newerEnded],
        provider: [newest, providerSubscription("sub-old", "active", "2026-10-01T00:00:00.000000Z")],
      });

      expect(await stillPaying.interactor.invoke(event("sub-old", signed("company-1")))).toBe("refused");
      expect(stillPaying.subscriptionService.syncSubscription).not.toHaveBeenCalled();
      expect(stillPaying.mails().map((mail) => mail.props.reason)).toEqual(["olderLive"]);
    },
  );

  it.each(["cancelled", "expired", "unpaid"])(
    "acknowledges an event of the older subscription once it is %s, without telling the operator again",
    async (status) => {
      const live = { ...unbound, status: "active", lemonSqueezyId: "sub-new" };
      const { interactor, subscriptionService, mails } = setup({
        workspaces: [live],
        provider: [
          providerSubscription("sub-old", status, "2026-10-01T00:00:00.000000Z"),
          providerSubscription("sub-new", "active", "2026-10-16T09:00:00.000000Z"),
        ],
      });

      expect(await interactor.invoke(event("sub-old", signed("company-1")))).toBe("ignored");

      expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
      expect(mails()).toEqual([]);
    },
  );
});

describe("an unsigned workspace claim", () => {
  it("binds a subscription created before the end of the transition to a workspace without a live binding", async () => {
    const incoming = providerSubscription("sub-1", "active", BEFORE_END.toISOString());
    const { interactor, subscriptionService, mails } = setup({ workspaces: [unbound], provider: [incoming] });

    const result = await interactor.invoke(event("sub-1", unsigned("company-1"), BEFORE_END));

    expect(result).toBe("applied");
    expect(subscriptionService.syncSubscription).toHaveBeenCalledExactlyOnceWith(unbound, incoming);
    expect(mails()).toEqual([]);
  });

  it.each([
    ["created after the transition ended", AFTER_END],
    ["without a creation time", null],
  ])("binds nothing for a subscription %s and tells the operator", async (_, createdAt) => {
    const { interactor, subscriptionService, mails } = setup({ workspaces: [unbound] });

    const result = await interactor.invoke(event("sub-1", unsigned("company-1"), createdAt));

    expect(result).toBe("refused");
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
      const { interactor, subscriptionService, mails } = setup({
        workspaces: [live],
        provider: [
          providerSubscription("sub-0", "active", "2026-09-01T00:00:00.000000Z"),
          providerSubscription("sub-1", "active", BEFORE_END.toISOString()),
        ],
      });

      const result = await interactor.invoke(event("sub-1", unsigned("company-1"), BEFORE_END));

      expect(result).toBe("refused");
      expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
      expect(mails().map((mail) => mail.props.reason)).toEqual(["unsigned"]);
    },
  );

  it("acknowledges an event of a replaced older checkout once it is no longer live", async () => {
    const replacedBy = { ...unbound, status: "active", lemonSqueezyId: "sub-new" };
    const { interactor, subscriptionService, mails } = setup({
      workspaces: [replacedBy],
      provider: [
        providerSubscription("sub-new", "active", "2026-10-16T09:00:00.000000Z"),
        providerSubscription("sub-legacy", "cancelled", "2026-10-01T00:00:00.000000Z"),
      ],
    });

    const result = await interactor.invoke(
      event("sub-legacy", unsigned("company-1"), new Date("2026-10-01T00:00:00.000Z")),
    );

    expect(result).toBe("ignored");
    expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
    expect(mails()).toEqual([]);
  });

  it("tells the operator the workspace is missing when an older checkout names a deleted one", async () => {
    const { interactor, mails } = setup({});

    expect(await interactor.invoke(event("sub-1", unsigned("unknown-company"), BEFORE_END))).toBe("ignored");
    expect(mails()).toEqual([
      expect.objectContaining({
        subject: "Lemon Squeezy payment for a missing workspace",
        props: expect.objectContaining({
          reason: "workspaceMissing",
          workspaceId: "unknown-company",
          workspaceName: null,
        }),
      }),
    ]);
  });
});

describe("events racing each other", () => {
  it.each([
    ["a signed", signed("company-1")],
    ["an unsigned", unsigned("company-1")],
  ])(
    "updates the workspace when another event bound %s claim's subscription between the two reads",
    async (_, claim) => {
      const justBound = { ...unbound, status: "active", lemonSqueezyId: "sub-1" };
      const incoming = providerSubscription("sub-1", "active", AFTER_END.toISOString());
      const { interactor, repo, subscriptionService, mails } = setup({ workspaces: [justBound], provider: [incoming] });
      repo.findWorkspaceBillingBySubscriptionIdUnscoped.mockResolvedValueOnce(null);

      expect(await interactor.invoke(event("sub-1", claim, AFTER_END))).toBe("applied");

      expect(subscriptionService.syncSubscription).toHaveBeenCalledExactlyOnceWith(justBound, incoming);
      expect(mails()).toEqual([]);
    },
  );

  it("treats a malformed signature for a missing workspace as forged", async () => {
    const { interactor, mails } = setup({});

    expect(await interactor.invoke(event("sub-1", { companyId: "missing-company", signature: "" }))).toBe("refused");

    expect(mails().map((mail) => mail.props.reason)).toEqual(["forged"]);
  });
});

describe("an event that names no workspace", () => {
  it("binds nothing, asks the provider nothing and tells the operator", async () => {
    const { interactor, subscriptionService, mails } = setup({ workspaces: [unbound] });

    const result = await interactor.invoke(event("sub-1", null));

    expect(result).toBe("refused");
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

describe("an event for a workspace that no longer exists", () => {
  it.each(["subscription_updated", "subscription_cancelled", "subscription_expired", "subscription_resumed"])(
    "acknowledges %s without changes or an e-mail and logs it",
    async (eventName) => {
      const { interactor, subscriptionService, mails } = setup({});

      expect(await interactor.invoke(named(eventName, "sub-1", signed("deleted-company")))).toBe("ignored");

      expect(subscriptionService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
      expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
      expect(mails()).toEqual([]);
      expect(Sentry.captureMessage).toHaveBeenCalledExactlyOnceWith(
        "Lemon Squeezy event for a missing workspace acknowledged without changes",
        { level: "info", tags: { eventName, subscriptionId: "sub-1", companyId: "deleted-company" } },
      );
    },
  );

  it("acknowledges an unsigned claim of an older checkout the same way", async () => {
    const { interactor, mails } = setup({});

    const result = await interactor.invoke({
      ...named("subscription_cancelled", "sub-1", unsigned("deleted-company")),
      subscriptionCreatedAt: BEFORE_END,
    });

    expect(result).toBe("ignored");
    expect(mails()).toEqual([]);
    expect(Sentry.captureMessage).toHaveBeenCalledOnce();
  });
});

describe("a successful payment", () => {
  it("tells the operator when it pays for a subscription whose workspace no longer exists", async () => {
    const { interactor, subscriptionService, mails } = setup({ workspaces: [unbound] });

    expect(await interactor.invoke(payment("sub-1", signed("deleted-company")))).toBe("ignored");

    expect(subscriptionService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
    expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(mails()).toEqual([
      {
        to: "operator@example.invalid",
        subject: "Lemon Squeezy payment for a missing workspace",
        props: expect.objectContaining({
          reason: "workspaceMissing",
          eventName: "subscription_payment_success",
          subscriptionId: "sub-1",
          workspaceId: "deleted-company",
          workspaceName: null,
          otherSubscriptionId: null,
        }),
      },
    ]);
  });

  it("tells the operator about an unsigned claim of an older checkout for a deleted workspace too", async () => {
    const { interactor, mails } = setup({});

    expect(await interactor.invoke(payment("sub-1", unsigned("deleted-company")))).toBe("ignored");

    expect(mails().map((mail) => mail.props.reason)).toEqual(["workspaceMissing"]);
  });

  it.each([
    ["a workspace holds the subscription", signed("deleted-company"), { ...unbound, lemonSqueezyId: "sub-1" }],
    ["it names an existing workspace", signed("company-1"), unbound],
    ["it names no workspace", null, unbound],
    ["its claim is forged", { companyId: "deleted-company", signature: "not-a-signature" }, unbound],
  ])("acknowledges it without changes or an e-mail when %s", async (_, claim, workspace) => {
    const { interactor, subscriptionService, deleteAccountsForPlan, mails } = setup({ workspaces: [workspace] });

    expect(await interactor.invoke(payment("sub-1", claim))).toBe("ignored");

    expect(subscriptionService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
    expect(subscriptionService.syncSubscription).not.toHaveBeenCalled();
    expect(deleteAccountsForPlan.invoke).not.toHaveBeenCalled();
    expect(mails()).toEqual([]);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
