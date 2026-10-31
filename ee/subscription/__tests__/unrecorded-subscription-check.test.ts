import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    RESEND_OPERATOR_EMAIL: "operator@example.invalid",
    LEMONSQUEEZY_VARIANT_ID_STARTER: "2001",
    LEMONSQUEEZY_VARIANT_ID_PRO: "2002",
    LEMONSQUEEZY_VARIANT_ID_BUSINESS: "2003",
    LEMONSQUEEZY_VARIANT_ID_MAX: "2004",
  },
}));
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

const { UnrecordedSubscriptionCheck } = await import("../unrecorded-subscription-check");

const STARTED = new Date("2026-10-18T12:00:00.000Z");

function subscription(id: string, createdAt: string, overrides: { status?: string; variant?: number | null } = {}) {
  return {
    data: {
      id,
      attributes: {
        status: overrides.status ?? "active",
        created_at: createdAt,
        variant_id: "variant" in overrides ? overrides.variant : 2002,
      },
    },
  } as never;
}

const workspace = {
  companyId: "company-2",
  name: "Second",
  checkoutStartedAt: STARTED,
  checkoutEmail: "Payer@Example.invalid",
};

describe("UnrecordedSubscriptionCheck", () => {
  const provider = { listStoreSubscriptionsByEmailOrThrowUnscoped: vi.fn() };
  const bindings = { findWorkspaceBillingBySubscriptionIdUnscoped: vi.fn() };
  const mail = { send: vi.fn() };

  function check() {
    return new UnrecordedSubscriptionCheck(provider as never, bindings as never, mail as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mockResolvedValue([]);
    bindings.findWorkspaceBillingBySubscriptionIdUnscoped.mockResolvedValue(null);
    mail.send.mockResolvedValue(true);
  });

  it("asks for the checkout's prefilled e-mail and every member's e-mail once", async () => {
    await expect(check().findUnscoped(workspace, ["owner@example.invalid", "payer@example.invalid"])).resolves.toBe(
      "none",
    );

    expect(provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mock.calls.map(([email]) => email)).toEqual([
      "payer@example.invalid",
      "owner@example.invalid",
    ]);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("allows the delete when the same e-mail's subscription is recorded on another workspace", async () => {
    provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mockResolvedValue([
      subscription("sub-other", "2026-10-18T12:05:00.000Z"),
    ]);
    bindings.findWorkspaceBillingBySubscriptionIdUnscoped.mockResolvedValue({ companyId: "company-1" });

    await expect(check().findUnscoped(workspace, [])).resolves.toBe("none");
    expect(mail.send).not.toHaveBeenCalled();
  });

  it.each([
    ["created before the checkout started", subscription("sub-old", "2026-10-18T11:59:59.000Z")],
    ["on a variant that is not ours", subscription("sub-foreign", "2026-10-18T12:05:00.000Z", { variant: 9999 })],
    ["without a variant", subscription("sub-none", "2026-10-18T12:05:00.000Z", { variant: null })],
    ["expired", subscription("sub-expired", "2026-10-18T12:05:00.000Z", { status: "expired" })],
  ])("ignores a subscription %s", async (_label, listed) => {
    provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mockResolvedValue([listed]);

    await expect(check().findUnscoped(workspace, [])).resolves.toBe("none");
    expect(bindings.findWorkspaceBillingBySubscriptionIdUnscoped).not.toHaveBeenCalled();
  });

  it("finds an unrecorded subscription paid after the checkout and tells the operator, without attaching it", async () => {
    provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mockResolvedValue([
      subscription("sub-early", "2026-10-18T12:01:00.000Z"),
      subscription("sub-late", "2026-10-18T12:09:00.000Z", { status: "on_trial" }),
    ]);

    await expect(check().findUnscoped(workspace, [])).resolves.toBe("found");

    expect(mail.send).toHaveBeenCalledOnce();
    const [{ to, subject, react }] = mail.send.mock.calls[0] as [
      { to: string; subject: string; react: { props: Record<string, unknown> } },
    ];
    expect(to).toBe("operator@example.invalid");
    expect(subject).toBe("Workspace deletion blocked by an unrecorded subscription");
    expect(react.props).toMatchObject({
      reason: "deletionBlocked",
      subscriptionId: "sub-late",
      otherSubscriptionId: "sub-early",
      workspaceId: "company-2",
      workspaceName: "Second",
    });
    expect(Object.keys(provider)).toEqual(["listStoreSubscriptionsByEmailOrThrowUnscoped"]);
  });

  it("still refuses when the operator alert cannot be sent", async () => {
    provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mockResolvedValue([
      subscription("sub-1", "2026-10-18T12:05:00.000Z"),
    ]);
    mail.send.mockRejectedValue(new Error("mail down"));

    await expect(check().findUnscoped(workspace, [])).resolves.toBe("found");
  });

  it("cannot verify when Lemon Squeezy is unreachable", async () => {
    provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mockRejectedValue(new Error("fetch failed"));

    await expect(check().findUnscoped(workspace, [])).resolves.toBe("unverified");
    expect(mail.send).not.toHaveBeenCalled();
  });
});
