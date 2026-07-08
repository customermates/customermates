import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

export const DYNAMIC_KEY_SITES = [
  "app/[locale]/(protected)/company/components/audit-log/audit-log-modal.tsx :: t :: Common.events.",
  "app/[locale]/(protected)/company/components/audit-log/audit-logs-card.tsx :: t :: Common.events.",
  "app/[locale]/(protected)/company/components/company-details/company-details-form.tsx :: t :: Common.currencies.",
  "app/[locale]/(protected)/company/components/feedback/feedback-modal.tsx :: t :: ",
  "app/[locale]/(protected)/company/components/role/role-modal.tsx :: t :: RoleModal.resources.",
  "app/[locale]/(protected)/company/components/subscription/subscription-panel.tsx :: t :: Subscription.status.",
  "app/[locale]/(protected)/company/components/user/user-modal.tsx :: t :: Common.userStatuses.",
  "app/[locale]/(protected)/company/components/user/users-card.tsx :: t :: Common.userStatuses.",
  "app/[locale]/(protected)/company/components/webhook/webhook-deliveries-card.tsx :: t :: Common.events.",
  "app/[locale]/(protected)/company/components/webhook/webhook-deliveries-card.tsx :: t :: WebhookDeliveryModal.deliveryStatus.",
  "app/[locale]/(protected)/company/components/webhook/webhook-delivery-modal.tsx :: t :: Common.events.",
  "app/[locale]/(protected)/company/components/webhook/webhook-delivery-modal.tsx :: t :: WebhookDeliveryModal.deliveryStatus.",
  "app/[locale]/(protected)/company/components/webhook/webhook-modal.tsx :: t :: Common.events.",
  "app/[locale]/(protected)/company/components/webhook/webhooks-card.tsx :: t :: Common.events.",
  "app/[locale]/(protected)/contacts/components/add-channel-popover.tsx :: t :: Common.providers.",
  "app/[locale]/(protected)/contacts/components/channel-icon-stack.tsx :: t :: Common.providers.",
  "app/[locale]/(protected)/contacts/components/contact-channels.tsx :: t :: Common.providers.",
  "app/[locale]/(protected)/dashboard/components/widget-card.tsx :: t :: Common.filters.operators.",
  "app/[locale]/(protected)/dashboard/components/widget-modal.tsx :: t :: Dashboard.displayTypes.",
  "app/[locale]/(protected)/dashboard/components/widget-modal.tsx :: t :: Dashboard.entityTypes.",
  "app/[locale]/(protected)/inbox/components/thread-row.tsx :: t :: Common.providers.",
  "app/[locale]/(protected)/inbox/components/thread-row.tsx :: t :: Inbox.threadStates.",
  "app/[locale]/(protected)/inbox/components/thread-state-picker.tsx :: t :: Inbox.threadStates.",
  "app/[locale]/(protected)/onboarding/wizard/components/onboarding-wizard.tsx :: t :: OnboardingWizard.steps.",
  "app/[locale]/(protected)/onboarding/wizard/components/step-ai.tsx :: t :: OnboardingWizard.ai.choices.",
  "app/[locale]/(protected)/onboarding/wizard/components/step-ai.tsx :: t :: OnboardingWizard.ai.install.instruction.",
  "app/[locale]/(protected)/onboarding/wizard/components/step-company.tsx :: t :: Common.currencies.",
  "app/[locale]/(protected)/onboarding/wizard/components/step-entities.tsx :: t :: OnboardingWizard.entities.",
  "app/[locale]/(protected)/profile/components/account-status-color.ts :: t :: Common.providers.",
  "app/[locale]/(protected)/profile/components/connected-account-modal.tsx :: t :: ConnectedAccountsCard.statusLabels.",
  "app/[locale]/(protected)/profile/components/connected-accounts-card.tsx :: t :: ConnectedAccountsCard.statusLabels.",
  "app/[locale]/(protected)/profile/components/user-details-avatar.tsx :: t :: Common.userStatuses.",
  "app/[locale]/(protected)/profile/components/user-settings-form.tsx :: t :: Common.locales.",
  "app/[locale]/(protected)/profile/components/user-settings-form.tsx :: t :: Common.themes.",
  "app/[locale]/(public)/auth/error/page.tsx :: t :: ErrorCard.",
  "app/[locale]/(public)/auth/social-error-toast.tsx :: t :: AuthSocialErrors.",
  "app/[locale]/(static)/components/homepage-pricing.tsx :: t :: HomepagePricing.",
  "app/[locale]/(static)/components/homepage-pricing.tsx :: t :: HomepagePricing.compare.",
  "app/components/app-sidebar.tsx :: t :: Subscription.status.",
  "components/data-view/custom-columns/custom-column-modal.tsx :: t :: Common.colors.",
  "components/data-view/custom-columns/custom-column-modal.tsx :: t :: Common.currencies.",
  "components/data-view/custom-columns/custom-column-modal.tsx :: t :: Common.customColumnTypes.",
  "components/data-view/custom-columns/custom-field-editor.tsx :: t :: Common.inputs.",
  "components/data-view/data-view-container.tsx :: t :: Common.table.columns.",
  "components/data-view/filter-modal/filter-accordion.tsx :: t :: Common.filters.fields.",
  "components/data-view/filter-modal/filter-chip-display.tsx :: t :: Common.filters.fields.",
  "components/data-view/filter-modal/filter-field.tsx :: t :: Common.filters.operators.",
  "components/data-view/filter-modal/inputs/filter-input-iso-date-range.tsx :: t :: Common.datePresets.",
  "components/data-view/filter-modal/inputs/filter-input-iso-date.tsx :: t :: Common.datePresets.",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Common.events.",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Common.providers.",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Common.userStatuses.",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: EntityTimeline.types.",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Inbox.threadStates.",
  "components/data-view/header/active-filters-bar.tsx :: t :: Common.filters.operators.",
  "components/data-view/header/display-options.tsx :: t :: Common.table.columns.",
  "components/entity-detail/audit-event-tone.ts :: t :: Common.table.columns.",
  "components/forms/form-iso-date-picker.tsx :: t :: Common.datePresets.",
  "components/forms/form-iso-date-range-picker.tsx :: t :: Common.datePresets.",
  "components/forms/use-form-field.ts :: t :: Common.inputs.",
  "app/[locale]/(protected)/contacts/components/contact-compose-popover.tsx :: t :: Common.providers.",
  "components/shared/language-selector.tsx :: t :: Common.locales.",
  "core/validation/zod-error-map-server.ts :: t.raw :: Common.errors.",
  "ee/messaging/outbound/resolve-provider-profile.interactor.ts :: t :: Common.errors.",
  "ee/messaging/outbound/send-chat-message.interactor.ts :: t :: Common.errors.",
  "ee/messaging/outbound/send-email.interactor.ts :: t :: Common.errors.",
  "ee/messaging/outbound/start-chat.interactor.ts :: t :: Common.errors.",
  "ee/messaging/posts/accept-relation-request.interactor.ts :: t :: Common.errors.",
  "ee/messaging/posts/cancel-relation-request.interactor.ts :: t :: Common.errors.",
  "ee/messaging/posts/create-relation-request.interactor.ts :: t :: Common.errors.",
  "ee/messaging/sales-navigator/browse-sales-list.interactor.ts :: t :: Common.errors.",
  "ee/messaging/sales-navigator/list-sales-lists.interactor.ts :: t :: Common.errors.",
  "ee/messaging/sales-navigator/list-sales-search-parameters.interactor.ts :: t :: Common.errors.",
  "ee/messaging/sales-navigator/save-to-sales-list.interactor.ts :: t :: Common.errors.",
  "ee/messaging/sales-navigator/search-sales-companies.interactor.ts :: t :: Common.errors.",
  "ee/messaging/sales-navigator/search-sales-navigator.interactor.ts :: t :: Common.errors.",
  "ee/messaging/sales-navigator/search-sales-people.interactor.ts :: t :: Common.errors.",
  "ee/messaging/posts/get-social-post.interactor.ts :: t :: Common.errors.",
  "ee/messaging/posts/get-social-profile.interactor.ts :: t :: Common.errors.",
  "ee/messaging/posts/list-relation-requests.interactor.ts :: t :: Common.errors.",
  "ee/messaging/posts/list-social-comment-reactions.interactor.ts :: t :: Common.errors.",
  "ee/messaging/posts/list-social-post-comments.interactor.ts :: t :: Common.errors.",
  "ee/messaging/posts/list-social-post-reactions.interactor.ts :: t :: Common.errors.",
  "ee/messaging/posts/list-social-posts.interactor.ts :: t :: Common.errors.",
  "features/auth/sign-in-with-email.interactor.ts :: t :: Common.errors.",
  "features/auth/sign-up-with-email.interactor.ts :: t :: Common.errors.",
  "features/messaging/activities/activities-detail-modal.tsx :: t :: Common.events.",
  "features/messaging/activities/activities-detail-modal.tsx :: t :: Common.providers.",
  "features/messaging/activities/activities-panel.tsx :: t :: Common.events.",
  "features/messaging/activities/activities-panel.tsx :: t :: Common.providers.",
  "features/messaging/activities/audit-detail.tsx :: t :: Common.events.",
  "features/messaging/activities/audit-detail.tsx :: t :: Common.table.columns.",
  "features/user/prisma-user.repository.ts :: t :: Common.defaultData.todo.states.",
  "features/user/prisma-user.repository.ts :: t :: Common.seedData.contact.",
  "features/user/prisma-user.repository.ts :: t :: Common.seedData.deal.",
  "features/user/prisma-user.repository.ts :: t :: Common.seedData.organization.",
  "features/user/prisma-user.repository.ts :: t :: Common.seedData.pipeline.",
  "features/user/prisma-user.repository.ts :: t :: Common.seedData.service.",
  "features/user/prisma-user.repository.ts :: t :: Common.seedData.task.",
  "features/user/prisma-user.repository.ts :: t :: Common.seedData.widget.",
];

const SOURCE_DIRECTORIES = ["app", "components", "features", "ee", "core"];

const T_CALL_PATTERN = /(?:(?<![\w$.])|(?<=this\.))(t(?:\.(?:rich|raw|markup|has))?)\(\s*("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g;
const GET_TRANSLATION_PATTERN = /(?<![\w$])(getTranslation)\(\s*("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g;
const NAMESPACE_PATTERN = /(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)/g;
const TRANSLATOR_NAMESPACE_PATTERN = /getTranslator\(\s*[^,)]+,\s*"([^"]+)"\s*\)/g;

function loadCatalogPaths(): { leafPaths: Set<string>; nodePaths: Set<string> } {
  const raw = readFileSync(join(REPO_ROOT, "i18n", "locales", "en.json"), "utf8");
  const leafPaths = new Set<string>();
  const nodePaths = new Set<string>();
  const collect = (value: unknown, prefix: string) => {
    if (value !== null && typeof value === "object") {
      if (prefix) nodePaths.add(prefix);
      for (const [key, child] of Object.entries(value)) collect(child, prefix ? `${prefix}.${key}` : key);
      return;
    }
    leafPaths.add(prefix);
  };
  collect(JSON.parse(raw), "");
  return { leafPaths, nodePaths };
}

function resolves(key: string, namespaces: string[], catalog: ReturnType<typeof loadCatalogPaths>): boolean {
  if (catalog.leafPaths.has(key) || catalog.nodePaths.has(key)) return true;

  return namespaces.some(
    (namespace) => catalog.leafPaths.has(`${namespace}.${key}`) || catalog.nodePaths.has(`${namespace}.${key}`),
  );
}

function scanSources(): { staticViolations: string[]; dynamicSites: Set<string> } {
  const catalog = loadCatalogPaths();
  const staticViolations: string[] = [];
  const dynamicSites = new Set<string>();
  for (const directory of SOURCE_DIRECTORIES) {
    const files = walkFiles(
      join(REPO_ROOT, directory),
      (path) => /\.tsx?$/.test(path) && !path.includes("__tests__") && !/\.test\.tsx?$/.test(path),
    );
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const relPath = relative(REPO_ROOT, file);
      const namespaces = [
        ...[...source.matchAll(NAMESPACE_PATTERN)].map((match) => match[1]),
        ...[...source.matchAll(TRANSLATOR_NAMESPACE_PATTERN)].map((match) => match[1]),
      ];
      for (const pattern of [T_CALL_PATTERN, GET_TRANSLATION_PATTERN]) {
        for (const match of source.matchAll(pattern)) {
          const [full, callee, argument] = match;
          const matchIndex = match.index ?? 0;
          const body = argument.slice(1, -1);
          const isTemplate = argument.startsWith("`");
          if (isTemplate && body.includes("${")) {
            dynamicSites.add(`${relPath} :: ${callee} :: ${body.split("${")[0]}`);
            continue;
          }
          if (!isTemplate && source.slice(matchIndex + full.length).trimStart().startsWith("+")) {
            dynamicSites.add(`${relPath} :: ${callee} :: ${body}`);
            continue;
          }
          if (!resolves(body, namespaces, catalog)) {
            const line = source.slice(0, matchIndex).split("\n").length;
            staticViolations.push(`${relPath}:${line} ${callee}("${body}")`);
          }
        }
      }
    }
  }
  return { staticViolations, dynamicSites };
}

describe("i18n key resolution", () => {
  const { staticViolations, dynamicSites } = scanSources();

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("resolves every static translation key against the catalog", () => {
    expect(staticViolations, `unresolvable translation keys:\n${staticViolations.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("registers every dynamic translation key site", () => {
    const registered = new Set(DYNAMIC_KEY_SITES);
    const unregistered = [...dynamicSites].filter((site) => !registered.has(site)).sort();
    expect(unregistered, `dynamic key sites missing from DYNAMIC_KEY_SITES:\n${unregistered.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("keeps the dynamic-site registry free of stale entries", () => {
    const stale = DYNAMIC_KEY_SITES.filter((site) => !dynamicSites.has(site));
    expect(stale, `stale DYNAMIC_KEY_SITES entries:\n${stale.join("\n")}`).toEqual([]);
  });
});
