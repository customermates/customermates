import { describe, expect, it } from "vitest";

import { SubscriptionStatus } from "@/generated/prisma";

import { isSubscriptionExpired, isSubscriptionUsable } from "../entitlements";

const NOW = new Date("2026-08-13T12:00:00.000Z");
const AFTER = new Date(NOW.getTime() + 1);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

describe("isSubscriptionExpired", () => {
  it("treats non-paying terminal and delinquent statuses as blocked", () => {
    expect(
      isSubscriptionExpired({
        status: SubscriptionStatus.unPaid,
        trialEndDate: null,
      }),
    ).toBe(true);
    expect(
      isSubscriptionExpired({
        status: SubscriptionStatus.expired,
        trialEndDate: FUTURE,
      }),
    ).toBe(true);
    expect(
      isSubscriptionExpired({
        status: SubscriptionStatus.pastDue,
        trialEndDate: null,
      }),
    ).toBe(true);
  });

  it("treats a trial whose end date has passed as expired", () => {
    expect(
      isSubscriptionExpired({
        status: SubscriptionStatus.trial,
        trialEndDate: PAST,
      }),
    ).toBe(true);
  });

  it("keeps active subscriptions and trials with a live end date usable", () => {
    expect(
      isSubscriptionExpired({
        status: SubscriptionStatus.active,
        trialEndDate: null,
      }),
    ).toBe(false);
    expect(
      isSubscriptionExpired({
        status: SubscriptionStatus.trial,
        trialEndDate: FUTURE,
      }),
    ).toBe(false);
    expect(
      isSubscriptionExpired({
        status: SubscriptionStatus.trial,
        trialEndDate: null,
      }),
    ).toBe(true);
  });

  it("keeps a cancellation usable through its paid period and blocks it afterward", () => {
    expect(
      isSubscriptionExpired({
        status: SubscriptionStatus.cancelled,
        trialEndDate: null,
        currentPeriodEnd: FUTURE,
      }),
    ).toBe(false);
    expect(
      isSubscriptionExpired({
        status: SubscriptionStatus.cancelled,
        trialEndDate: null,
        currentPeriodEnd: PAST,
      }),
    ).toBe(true);
    expect(
      isSubscriptionExpired({
        status: SubscriptionStatus.cancelled,
        trialEndDate: null,
        currentPeriodEnd: null,
      }),
    ).toBe(true);
  });
});

describe("isSubscriptionUsable", () => {
  it("is usable while active or on a trial with a live end date", () => {
    expect(
      isSubscriptionUsable({
        status: SubscriptionStatus.active,
        trialEndDate: null,
      }),
    ).toBe(true);
    expect(
      isSubscriptionUsable({
        status: SubscriptionStatus.trial,
        trialEndDate: FUTURE,
      }),
    ).toBe(true);
    expect(
      isSubscriptionUsable({
        status: SubscriptionStatus.trial,
        trialEndDate: null,
      }),
    ).toBe(false);
  });

  it("is not usable once the trial lapses or the subscription is delinquent/expired", () => {
    expect(
      isSubscriptionUsable({
        status: SubscriptionStatus.trial,
        trialEndDate: PAST,
      }),
    ).toBe(false);
    expect(
      isSubscriptionUsable({
        status: SubscriptionStatus.unPaid,
        trialEndDate: null,
      }),
    ).toBe(false);
    expect(
      isSubscriptionUsable({
        status: SubscriptionStatus.expired,
        trialEndDate: null,
      }),
    ).toBe(false);
    expect(
      isSubscriptionUsable({
        status: SubscriptionStatus.pastDue,
        trialEndDate: null,
      }),
    ).toBe(false);
  });

  it("uses the paid-through boundary for cancelled subscriptions", () => {
    expect(
      isSubscriptionUsable({
        status: SubscriptionStatus.cancelled,
        trialEndDate: null,
        currentPeriodEnd: FUTURE,
      }),
    ).toBe(true);
    expect(
      isSubscriptionUsable({
        status: SubscriptionStatus.cancelled,
        trialEndDate: null,
        currentPeriodEnd: PAST,
      }),
    ).toBe(false);
  });

  it("treats trial and paid-through timestamps as exclusive boundaries", () => {
    expect(
      isSubscriptionUsable(
        {
          status: SubscriptionStatus.trial,
          trialEndDate: AFTER,
        },
        NOW,
      ),
    ).toBe(true);
    expect(
      isSubscriptionUsable(
        {
          status: SubscriptionStatus.trial,
          trialEndDate: NOW,
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      isSubscriptionUsable(
        {
          status: SubscriptionStatus.cancelled,
          trialEndDate: null,
          currentPeriodEnd: AFTER,
        },
        NOW,
      ),
    ).toBe(true);
    expect(
      isSubscriptionUsable(
        {
          status: SubscriptionStatus.cancelled,
          trialEndDate: null,
          currentPeriodEnd: NOW,
        },
        NOW,
      ),
    ).toBe(false);
  });
});
