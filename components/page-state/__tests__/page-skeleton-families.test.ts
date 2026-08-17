import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DashboardPageSkeleton } from "@/app/[locale]/(protected)/dashboard/components/dashboard-page-skeleton";
import { InboxPageSkeleton } from "@/app/[locale]/(protected)/inbox/components/inbox-page-skeleton";
import { CompanySettingsPageSkeleton } from "@/app/[locale]/(protected)/company/components/company-settings/company-settings-page-skeleton";
import { SubscriptionPageSkeleton } from "@/app/[locale]/(protected)/company/components/subscription/subscription-page-skeleton";
import { OnboardingPageSkeleton } from "@/app/[locale]/(protected)/onboarding/wizard/components/onboarding-page-skeleton";
import {
  ApiKeysPageSkeleton,
  ConnectedAccountsPageSkeleton,
} from "@/app/[locale]/(protected)/profile/components/profile-resource-page-skeleton";
import { ProfileSettingsPageSkeleton } from "@/app/[locale]/(protected)/profile/components/profile-settings-page-skeleton";
import {
  EntityDetailDrawerSkeleton,
  EntityDetailPageSkeleton,
} from "@/components/entity-detail/entity-detail-page-skeleton";
import { CenteredCardPageSkeleton } from "@/components/shared/centered-card-page-skeleton";

const count = (markup: string, marker: string) => markup.split(marker).length - 1;

describe("page skeleton families", () => {
  it.each([
    ["dashboard", DashboardPageSkeleton],
    ["detail", EntityDetailPageSkeleton],
    ["profile-settings", ProfileSettingsPageSkeleton],
    ["company-settings", CompanySettingsPageSkeleton],
    ["subscription", SubscriptionPageSkeleton],
    ["api-keys", ApiKeysPageSkeleton],
    ["connected-accounts", ConnectedAccountsPageSkeleton],
    ["centered-card", CenteredCardPageSkeleton],
    ["onboarding", OnboardingPageSkeleton],
  ] as const)("renders animated and static %s geometry from the same component", (_name, SkeletonComponent) => {
    const loading = renderToStaticMarkup(createElement(SkeletonComponent));
    const empty = renderToStaticMarkup(createElement(SkeletonComponent, { animated: false }));

    expect(loading).toContain('data-page-skeleton-loading="true"');
    expect(empty).toContain('data-page-skeleton-empty="true"');
    expect(loading).toContain("data-skeleton-shape");
    expect(empty).toContain("data-skeleton-shape");
    expect(empty).not.toContain("data-page-skeleton-loading");
  });

  it.each(["split", "list", "transcript"] as const)("owns the %s inbox geometry", (view) => {
    const loading = renderToStaticMarkup(createElement(InboxPageSkeleton, { view }));
    const empty = renderToStaticMarkup(createElement(InboxPageSkeleton, { animated: false, view }));

    expect(loading).toContain(`data-skeleton-view="${view}"`);
    expect(loading).toContain('data-page-skeleton-loading="true"');
    expect(empty).toContain('data-page-skeleton-empty="true"');
  });

  it("matches profile, company, and subscription settings geometry without fabricated branches", () => {
    const profile = renderToStaticMarkup(createElement(ProfileSettingsPageSkeleton));
    const company = renderToStaticMarkup(createElement(CompanySettingsPageSkeleton));
    const subscription = renderToStaticMarkup(createElement(SubscriptionPageSkeleton));

    expect(profile).toContain("data-profile-settings-avatar");
    expect(count(profile, "data-settings-field")).toBe(7);
    expect(count(company, "data-settings-field")).toBe(2);
    expect(count(company, "data-company-terminology-node")).toBe(5);
    expect(company).toContain("sm:grid-cols-2");
    expect(company).toContain("sm:min-h-14");
    expect(count(subscription, "data-settings-field")).toBe(1);
    expect(subscription).toContain("data-subscription-plan-field");
    expect(subscription).toContain("data-subscription-status-chip");
    expect(subscription).not.toContain("data-subscription-plan-picker");
  });

  it("keeps drawer loading on one body scroll owner without page timeline geometry", () => {
    const withFooter = renderToStaticMarkup(createElement(EntityDetailDrawerSkeleton));
    const withoutFooter = renderToStaticMarkup(createElement(EntityDetailDrawerSkeleton, { showFooter: false }));

    expect(count(withFooter, "data-skeleton-scroll-owner")).toBe(1);
    expect(withFooter).toContain('data-skeleton-scroll-owner="entity-drawer-body"');
    expect(withFooter).toContain("data-entity-drawer-footer");
    expect(withFooter).not.toContain("data-entity-detail-page-skeleton");
    expect(withoutFooter).not.toContain("data-entity-drawer-footer");
  });

  it("uses onboarding's profile-step geometry instead of the generic guarded card", () => {
    const onboarding = renderToStaticMarkup(createElement(OnboardingPageSkeleton));

    expect(onboarding).toContain("data-onboarding-profile-skeleton");
    expect(count(onboarding, "data-onboarding-field")).toBe(4);
    expect(onboarding).toContain("data-onboarding-checkbox");
    expect(onboarding).toContain("data-onboarding-continue");
    expect(onboarding).not.toContain("data-centered-card-hero");
    expect(onboarding).not.toContain("data-centered-card-footer");
  });
});
