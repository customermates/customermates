import type { UnipileAccount } from "../unipile.schema";

import { describe, expect, it } from "vitest";

import { deriveAccountConnection } from "../account-connection";
import { deriveAccountFeatures } from "../unipile.mappers";
import { isUsableSenderFor } from "../provider";

const calendarOnly: UnipileAccount = {
  id: "acc_calendar_only",
  provider: "google",
  status: "partial",
  oauth_scope: "openid https://www.googleapis.com/auth/calendar.readonly",
  metadata: { products_connection_status: { gmail: "disconnected", calendar: "running" } },
};

describe("Google product connection state", () => {
  it("keeps calendar connected when Gmail requires authentication or has no mailbox", () => {
    expect(deriveAccountConnection(calendarOnly)).toMatchObject({
      status: "ok",
      hasMessaging: false,
      hasCalendar: true,
      connectionDetails: {
        status: "partial",
        products: { gmail: "disconnected", calendar: "running" },
        reason: null,
      },
      statusCheckedAt: expect.any(Date),
    });
  });

  it("derives a single-product calendar connection from granted scopes without assuming Gmail", () => {
    expect(deriveAccountFeatures({ ...calendarOnly, status: "running", metadata: null })).toEqual({
      hasMessaging: false,
      hasCalendar: true,
    });
  });

  it("honors product status even when both mail and calendar scopes were granted", () => {
    expect(
      deriveAccountFeatures({
        ...calendarOnly,
        oauth_scope: ["https://mail.google.com/", "https://www.googleapis.com/auth/calendar"],
      }),
    ).toEqual({ hasMessaging: false, hasCalendar: true });
  });

  it("does not enable a product omitted from the provider's configured products", () => {
    expect(
      deriveAccountFeatures({
        ...calendarOnly,
        oauth_scope: ["https://mail.google.com/", "https://www.googleapis.com/auth/calendar"],
        metadata: { products_connection_status: { calendar: "running" } },
      }),
    ).toEqual({ hasMessaging: false, hasCalendar: true });
  });

  it("does not call a fully disconnected or unconfirmed partial account connected", () => {
    expect(
      deriveAccountConnection({
        ...calendarOnly,
        status: "disconnected",
        metadata: { products_connection_status: { gmail: "disconnected", calendar: "disconnected" } },
      }),
    ).toMatchObject({ status: "credentials", hasMessaging: false, hasCalendar: false });
    expect(deriveAccountConnection({ ...calendarOnly, metadata: null })).toMatchObject({ status: "credentials" });
  });

  it("keeps working email available while calendar has a service interruption", () => {
    expect(
      deriveAccountConnection({
        ...calendarOnly,
        status: "degraded",
        metadata: { products_connection_status: { gmail: "running", calendar: "errored" } },
      }),
    ).toMatchObject({ status: "ok", hasMessaging: true, hasCalendar: false });
  });

  it.each([
    ["paused", "stopped"],
    ["disconnected", "credentials"],
    ["errored", "error"],
  ] as const)("honors an account-wide %s status even when product metadata still says running", (status, expected) => {
    expect(deriveAccountConnection({ ...calendarOnly, status }).status).toBe(expected);
  });

  it("applies the same product isolation to Outlook Mail and Calendar", () => {
    expect(
      deriveAccountConnection({
        id: "acc_outlook_calendar",
        provider: "outlook",
        status: "partial",
        metadata: { products_connection_status: { mail: "disconnected", calendar: "running" } },
      }),
    ).toMatchObject({ status: "ok", hasMessaging: false, hasCalendar: true });
  });

  it("does not switch off a working account when the provider names its products differently", () => {
    expect(
      deriveAccountConnection({
        id: "acc_renamed_products",
        provider: "outlook",
        status: "running",
        metadata: { products_connection_status: { messages: "running", events: "running" } },
      }),
    ).toMatchObject({ status: "ok", hasMessaging: true, hasCalendar: true });
  });

  it("retains compatibility when older provider snapshots omit scopes and products", () => {
    expect(deriveAccountFeatures({ id: "acc_legacy", provider: "google", status: "running" })).toEqual({
      hasMessaging: true,
      hasCalendar: true,
    });
  });

  it("does not claim usable access when OAuth granted only identity scopes", () => {
    expect(
      deriveAccountConnection({
        id: "acc_identity_only",
        provider: "google",
        status: "running",
        oauth_scope: "openid email profile",
      }),
    ).toMatchObject({ status: "permissions", hasMessaging: false, hasCalendar: false });
  });

  it("stores only connection diagnostics, and retains a reason until that state changes", () => {
    const first = deriveAccountConnection(calendarOnly, { type: "provider", message: "Gmail is unavailable" });
    const next = deriveAccountConnection(calendarOnly, undefined, first.connectionDetails);
    expect(next.connectionDetails.reason).toBe("provider: Gmail is unavailable");
    expect(
      deriveAccountConnection(
        {
          ...calendarOnly,
          metadata: { products_connection_status: { calendar: "running", gmail: "disconnected" } },
        },
        undefined,
        first.connectionDetails,
      ).connectionDetails.reason,
    ).toBe(first.connectionDetails.reason);
    const recovered = deriveAccountConnection(
      {
        ...calendarOnly,
        status: "running",
        metadata: { products_connection_status: { gmail: "running", calendar: "running" } },
      },
      undefined,
      first.connectionDetails,
    );
    expect(recovered.connectionDetails.reason).toBeNull();
    expect(
      deriveAccountConnection({
        ...calendarOnly,
        metadata: { ...calendarOnly.metadata, custom_data: { private: "ignored" } },
      }).connectionDetails,
    ).not.toHaveProperty("custom_data");
  });

  it("redacts credentials in provider reason strings", () => {
    expect(
      deriveAccountConnection(calendarOnly, "access_token=synthetic-value Bearer synthetic-value").connectionDetails
        .reason,
    ).toBe("access_token=[redacted] Bearer [redacted]");
  });

  it("excludes a calendar-only account from email sender choices", () => {
    expect(isUsableSenderFor({ provider: "google", status: "ok", hasMessaging: false }, "mail")).toBe(false);
  });
});
