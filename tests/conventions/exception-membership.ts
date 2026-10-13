import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type RegistryShape, exceptionNamedConstants, registryMembers } from "./exception-registry";
import { readBaseSource, reviewBaseSha } from "./review-base";
import { REPO_ROOT } from "./walk";

const CONVENTIONS = "tests/conventions";

export type Registry = RegistryShape & { name: string; base?: { file: string; name: string } };

const registries = (...names: string[]): Registry[] => names.map((name) => ({ name }));

export const REGISTRY_FILES: Readonly<Record<string, readonly Registry[]>> = {
  "design-system.test.ts": registries(
    "TABS_ALLOWLIST",
    "OVERLAY_PRIMITIVE_EXEMPTIONS",
    "OVERLAY_PRIMITIVE_ALLOWLIST",
    "DESTRUCTIVE_ALLOWLIST",
    "DESTRUCTIVE_EXEMPTIONS",
    "TOP_BAR_ALLOWLIST",
    "VALUE_RENDERER_ALLOWLIST",
    "COLOR_EXEMPTIONS",
    "COLOR_ALLOWLIST",
    "INLINE_SVG_EXEMPTIONS",
    "INLINE_SVG_ALLOWLIST",
    "KEY_CAP_ALLOWLIST",
    "NATIVE_TITLE_EXEMPTIONS",
    "NATIVE_TITLE_ALLOWLIST",
  ),
  "design-unification.test.ts": registries(
    "LIST_ICON_ALLOWLIST",
    "ANIMATED_BLUR_ALLOWLIST",
    "LOCAL_FILTER_UI_ALLOWLIST",
    "FOCUS_LINK_ALLOWLIST",
    "ROW_MENU_ALLOWLIST",
    "TABLE_ROW_MENU_EXEMPTIONS",
    "TABLE_ROW_MENU_ALLOWLIST",
    "NON_STANDARD_CHIP_ALLOWLIST",
    "INLINE_HINT_ALLOWLIST",
    "HAND_BUILT_REVEAL_ALLOWLIST",
  ),
  "form-footer-actions.test.ts": registries(
    "EXEMPT",
    "NOT_YET_MIGRATED",
    "SAVE_LIKE_KEY_EXEMPT",
    "SAVE_LIKE_KEY_NOT_YET_MIGRATED",
  ),
  "interactor-error-contract.test.ts": [{ name: "FEATURE_ERROR_SUBCLASS_ALLOWLIST", valueIsMember: true }],
  "prisma-model-ownership.test.ts": registries("ALLOWLIST"),
  "raw-sql-tenancy.test.ts": registries("ALLOWLIST"),
  "settings-area-and-contact-values.test.ts": registries(
    "RETIRED_ROUTE_ALLOWLIST",
    "CONTACT_LINK_EXEMPTIONS",
    "CONTACT_LINK_ALLOWLIST",
  ),
  "ui-wording.test.ts": registries(
    "SHARED_ACTION_WORD_EXEMPTIONS",
    "SHARED_ACTION_WORD_ALLOWLIST",
    "GERMAN_TERM_EXEMPTIONS",
    "GERMAN_TERM_ALLOWLIST",
    "RETIRED_TERM_ALLOWLIST",
  ),
  "i18n-parity.test.ts": registries("ALLOWED_LOCALIZED_NUMBERS", "ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS"),
  "locale-consumer-audit.test.ts": registries(
    "ALLOWED",
    "ALLOWED_AMBIENT_FORMATTING_SITES",
    "ALLOWED_VISIBLE_COPY_SITES",
    "ALLOWED_LOCALE_BRANCHING",
    "ALLOWED_LOCALE_KEYED_TABLES",
  ),
  "docs-app-links.test.ts": registries("NOT_YET_CONVERTED"),
  "docs-fixed-host.test.ts": registries("ALLOWED"),
  "no-comments.test.ts": registries("FILE_ALLOWLIST"),
  "operator-access-boundary.test.ts": registries("UNDECORATED_ALLOWLIST"),
  "overlay-contract.test.ts": registries("FIXED_SURFACE_ALLOWLIST"),
  "prisma-tenant-fk.test.ts": registries("TENANT_FK_ALLOWLIST"),
  "repo-naming.test.ts": registries("OR_THROW_ALLOWLIST"),
  "rest-openapi-coverage.test.ts": registries("SPEC_EXEMPT_PATHS"),
  "runtime-console.test.ts": registries("ALLOWED_CALLS"),
  "tenant-write-scoping.test.ts": registries("GUARD_EXEMPT_MODELS"),
};

export const RULE_PARAMETER_CONSTANTS: Readonly<Record<string, string>> = {
  "design-system.test.ts#TITLE_EXEMPT_TAGS":
    "applicability: iframe, svg and its title element need a title attribute or element, it is not a tooltip",
  "exception-membership.ts#REVIEWED_EXCEPTION_ALLOWLIST":
    "the reviewed-addition ledger of this check; the pipeline allowlist count rejects its growth",
  "no-comments.test.ts#ALLOWED_DIRECTIVE": "applicability: lint, TypeScript and Prettier directives are not comments",
  "prisma-model-ownership.test.ts#ALLOWLIST_CEILING": "a size ceiling, not a member list",
  "raw-sql-tenancy.test.ts#ALLOWLIST_CEILING": "a size ceiling, not a member list",
  "walk.ts#SKIPPED_DIRECTORIES": "dependencies, build output and run artifacts that are not repository sources",
};

export const REVIEWED_EXCEPTION_ALLOWLIST = new Set<string>([
  "design-system.test.ts#OVERLAY_PRIMITIVE_EXEMPTIONS: app/components/app-sidebar.tsx",
  "design-system.test.ts#DESTRUCTIVE_EXEMPTIONS: components/modal/delete-confirmation-modal.tsx",
  "design-system.test.ts#COLOR_EXEMPTIONS: app/layout.tsx",
  "design-system.test.ts#COLOR_EXEMPTIONS: components/ai-connection/ai-client-logo.tsx",
  "design-system.test.ts#COLOR_EXEMPTIONS: ee/messaging/email-settings.ts",
  "design-system.test.ts#COLOR_EXEMPTIONS: ee/messaging/email-styles.ts",
  "design-system.test.ts#COLOR_EXEMPTIONS: features/messaging/email-frame.tsx",
  "design-system.test.ts#INLINE_SVG_EXEMPTIONS: app/[locale]/(protected)/dashboard/components/widget-display-type-picker.tsx",
  "design-system.test.ts#INLINE_SVG_EXEMPTIONS: app/[locale]/(protected)/onboarding/wizard/components/onboarding-artwork.tsx",
  "design-system.test.ts#INLINE_SVG_EXEMPTIONS: app/components/agent-chat/usage-ring.tsx",
  "design-system.test.ts#INLINE_SVG_EXEMPTIONS: components/ai-connection/ai-client-logo.tsx",
  "design-system.test.ts#NATIVE_TITLE_EXEMPTIONS: components/shared/locale-menu.tsx",
  "design-unification.test.ts#TABLE_ROW_MENU_EXEMPTIONS: app/[locale]/(protected)/operator/components/audit/operator-audit-page-view.tsx",
  "design-unification.test.ts#TABLE_ROW_MENU_EXEMPTIONS: app/[locale]/(protected)/operator/components/users/operator-users-page-view.tsx",
  "design-unification.test.ts#TABLE_ROW_MENU_EXEMPTIONS: app/[locale]/(protected)/operator/components/workspaces/operator-workspaces-page-view.tsx",
  "design-unification.test.ts#TABLE_ROW_MENU_EXEMPTIONS: app/[locale]/(protected)/settings/(workspace)/components/webhook/webhook-deliveries-page-view.tsx",
  "design-unification.test.ts#NON_STANDARD_CHIP_ALLOWLIST: app/[locale]/(protected)/inbox/components/thread-settings.tsx",
  "design-unification.test.ts#HAND_BUILT_REVEAL_ALLOWLIST: components/data-view/column-resize-handle.tsx",
  "design-unification.test.ts#HAND_BUILT_REVEAL_ALLOWLIST: components/data-view/row-actions.tsx",
  "design-unification.test.ts#HAND_BUILT_REVEAL_ALLOWLIST: components/layout/resizable-panels.tsx",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx [rules: submit-button]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/legal-update/components/legal-update-view.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/onboarding/join/join-workspace-card.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/onboarding/onboarding-choice-card.tsx [rules: submit-button]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/onboarding/wizard/components/onboarding-wizard.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/onboarding/wizard/components/step-ai.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/onboarding/wizard/components/step-profile.tsx [rules: submit-button]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/settings/(account)/components/connect-upsell-modal.tsx [rules: cancel-label]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/settings/(account)/components/connect-upsell-modal.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/settings/(workspace)/components/company-invite/invite-by-email-form.tsx [rules: submit-button]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/subscription-expired/components/subscription-expired-view.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/test/overlays/overlay-gallery.tsx [rules: confirm-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/test/overlays/overlay-gallery.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/test/overlays/overlay-gallery.tsx [rules: overlay-footer]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/forgot-password/forgot-password-form.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/forgot-password/forgot-password-form.tsx [rules: submit-button]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/invitation/invitation-card.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/mcp-consent/mcp-consent-card.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/pending/pending-card.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/reset-password/reset-password-form.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/reset-password/reset-password-form.tsx [rules: submit-button]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/signin/sign-in-form.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/signin/sign-in-form.tsx [rules: submit-button]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/signup/sign-up-form.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/signup/sign-up-form.tsx [rules: submit-button]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(public)/auth/verify-email/verify-email-card.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(static)/contact/contact-form.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(static)/contact/contact-form.tsx [rules: submit-button]",
  "form-footer-actions.test.ts#EXEMPT: components/ai-elements/message.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: components/data-view/filter-palette/filter-target-popover.tsx [rules: overlay-footer]",
  "form-footer-actions.test.ts#EXEMPT: components/shared/error-page-view.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: components/shared/locked-feature-overlay.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: components/shared/not-found-page-view.tsx [rules: footer-primitive]",
  "form-footer-actions.test.ts#EXEMPT: components/wiki/wiki-homepage-setup.tsx [rules: submit-button]",
  "form-footer-actions.test.ts#SAVE_LIKE_KEY_EXEMPT: DataTransfer.recordImport.update",
  "form-footer-actions.test.ts#SAVE_LIKE_KEY_EXEMPT: Editor.confirm",
  "form-footer-actions.test.ts#SAVE_LIKE_KEY_EXEMPT: Inbox.compose.saveDraft",
  "form-footer-actions.test.ts#SAVE_LIKE_KEY_EXEMPT: Inbox.compose.updateDraft",
  "interactor-error-contract.test.ts#FEATURE_ERROR_SUBCLASS_ALLOWLIST: ee/messaging/unipile-request-error.ts -> UnipileRequestError",
  "interactor-error-contract.test.ts#FEATURE_ERROR_SUBCLASS_ALLOWLIST: ee/routines/routine-run-limits.ts -> RoutineLimitExceededError",
  "prisma-model-ownership.test.ts#ALLOWLIST: AgentConversation ee/routines/prisma-routine.repository.ts",
  "prisma-model-ownership.test.ts#ALLOWLIST: Apikey ee/operator/prisma-operator.repository.ts",
  "prisma-model-ownership.test.ts#ALLOWLIST: AuthUser ee/operator/prisma-operator.repository.ts",
  "prisma-model-ownership.test.ts#ALLOWLIST: AuthVerification ee/operator/prisma-operator.repository.ts",
  "prisma-model-ownership.test.ts#ALLOWLIST: Company ee/operator/prisma-operator.repository.ts",
  "prisma-model-ownership.test.ts#ALLOWLIST: CrmRecord ee/operator/prisma-operator.repository.ts",
  "prisma-model-ownership.test.ts#ALLOWLIST: InviteToken ee/operator/prisma-operator.repository.ts",
  "prisma-model-ownership.test.ts#ALLOWLIST: MessagingInboundEvent ee/operator/prisma-operator.repository.ts",
  "prisma-model-ownership.test.ts#ALLOWLIST: RoutineRun ee/agent-chat/prisma-agent-chat.repository.ts",
  "prisma-model-ownership.test.ts#ALLOWLIST: Subscription ee/operator/prisma-operator.repository.ts",
  "prisma-model-ownership.test.ts#ALLOWLIST: User ee/operator/prisma-operator.repository.ts",
  "raw-sql-tenancy.test.ts#ALLOWLIST: core/decorators/transaction-runner.ts:runInSavepoint",
  "raw-sql-tenancy.test.ts#ALLOWLIST: core/decorators/transaction-runner.ts:runInTransaction",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.admitsHostedAiGlobalSpend",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.releaseStaleRetrievalReservations",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.settlePlatformUsageUnscoped",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.settleStalePlatformReservationsUnscoped",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.deleteWorkspaceUnscoped",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.getUserSummaryUnscoped",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.listWorkspaceTagsUnscoped",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.lockPlatformOperatorInvariant",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/command-palette/prisma-search-catalog.repository.ts:PrismaSearchCatalogRepo.replaceWorkspaceCatalog",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/command-palette/prisma-search-catalog.repository.ts:PrismaSearchCatalogRepo.semanticIndexAvailable",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/command-palette/prisma-search-catalog.repository.ts:PrismaSearchCatalogRepo.writeStaticCatalog",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.pendingEmbeddings",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.rankedFullTextSections",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.semanticIndexAvailable",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.semanticIndexComplete",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.semanticSections",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.storeEmbeddings",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.typoCorrections",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.writeCorpus",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/records/prisma-record.repository.ts:PrismaRecordRepo.searchRecords",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/user/prisma-user.repository.ts:PrismaUserRepo.findAuthUserCompanyIdForUpdateUnscoped",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/wiki/prisma-wiki-page.repository.ts:PrismaWikiPageRepo.rankPageSections",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/wiki/prisma-wiki-page.repository.ts:PrismaWikiPageRepo.sectionHeadlines",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/wiki/prisma-wiki-page.repository.ts:PrismaWikiPageRepo.semanticIndexAvailable",
  "raw-sql-tenancy.test.ts#ALLOWLIST: prisma/seeds/records.ts:calculateSyntheticRecords",
  "raw-sql-tenancy.test.ts#ALLOWLIST: prisma/seeds/records.ts:seedRecordFixtures",
  "raw-sql-tenancy.test.ts#ALLOWLIST: prisma/seeds/relationships.ts:seedRelationships",
  "raw-sql-tenancy.test.ts#ALLOWLIST: prisma/seeds/run.ts:runSyntheticSeed",
  "settings-area-and-contact-values.test.ts#CONTACT_LINK_EXEMPTIONS: app/[locale]/(protected)/subscription-expired/components/subscription-expired-view.tsx",
  "settings-area-and-contact-values.test.ts#CONTACT_LINK_EXEMPTIONS: app/components/agent-chat/credit-blocked-notice.tsx",
  "ui-wording.test.ts#SHARED_ACTION_WORD_EXEMPTIONS: AgentChat.approval.rejectAction",
  "ui-wording.test.ts#SHARED_ACTION_WORD_EXEMPTIONS: RecordModel.operators.add",
  "ui-wording.test.ts#SHARED_ACTION_WORD_EXEMPTIONS: ResetPasswordForm.resetPasswordCta",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Add",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Cancelled",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Contact",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Done",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Layout",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Link",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Number",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Open",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Pricing",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Services",
  "i18n-parity.test.ts#ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS: de:DataView.kanbanCount",
  "i18n-parity.test.ts#ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS: de:RecordWidgets.quarterLabel",
  "i18n-parity.test.ts#ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS: es:DataView.kanbanCount",
  "i18n-parity.test.ts#ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS: fr:DataView.kanbanCount",
  "i18n-parity.test.ts#ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS: fr:EntityTimeline.types.configuration",
  "i18n-parity.test.ts#ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS: it:DataView.kanbanCount",
  'locale-consumer-audit.test.ts#ALLOWED_VISIBLE_COPY_SITES: app/components/global-search-modal.tsx :: jsx-text :: "Tab"',
]);

const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 << 20,
    stdio: ["ignore", "pipe", "pipe"],
  });

const movesByBase = new Map<string, [string, string][]>();

function verifiedMoves(): [string, string][] {
  const base = reviewBaseSha();
  const cached = movesByBase.get(base);
  if (cached) return cached;
  const moves = git("diff", "-M", "--name-status", base)
    .split("\n")
    .filter((line) => line.startsWith("R"))
    .map((line): [string, string] => {
      const [, from, to] = line.split("\t");
      return [to, from];
    });
  movesByBase.set(base, moves);
  return moves;
}

function isVerifiedMove(member: string, base: ReadonlySet<string>) {
  return verifiedMoves().some(([to, from]) => member.includes(to) && base.has(member.split(to).join(from)));
}

function headSource(file: string) {
  return readFileSync(join(REPO_ROOT, CONVENTIONS, file), "utf8");
}

export function membershipAdditions(head: readonly string[], base: readonly string[]): string[] {
  const baseMembers = new Set(base);
  return head.filter((member) => !baseMembers.has(member) && !isVerifiedMove(member, baseMembers));
}

export function registrySourceAdditions(
  file: string,
  registry: Registry,
  source: string,
  baseSource: string | undefined,
): string[] {
  const head = registryMembers(`${CONVENTIONS}/${file}`, source, registry.name, registry);
  if (!head)
    throw new Error(
      `${file}#${registry.name} is configured as an exception registry but no longer exists; ` +
        "configure a moved registry at its new place with its base location",
    );
  const basePath = `${CONVENTIONS}/${registry.base?.file ?? file}`;
  const base = baseSource
    ? (registryMembers(basePath, baseSource, registry.base?.name ?? registry.name, registry) ?? [])
    : [];
  return membershipAdditions(head, base).map((member) => `${file}#${registry.name}: ${member}`);
}

export function registryAdditions(file: string): string[] {
  const registriesOfFile = REGISTRY_FILES[file];
  if (!registriesOfFile) throw new Error(`${file} has no exception registries configured in exception-membership.ts`);
  const source = headSource(file);
  return registriesOfFile.flatMap((registry) =>
    registrySourceAdditions(file, registry, source, readBaseSource(`${CONVENTIONS}/${registry.base?.file ?? file}`)),
  );
}

export function unreviewedExceptionAdditions(file: string): string[] {
  return registryAdditions(file).filter((addition) => !REVIEWED_EXCEPTION_ALLOWLIST.has(addition));
}

export function staleReviewedAdditions(): string[] {
  const additions = new Set(Object.keys(REGISTRY_FILES).flatMap(registryAdditions));
  return [...REVIEWED_EXCEPTION_ALLOWLIST].filter((addition) => !additions.has(addition));
}

export function unclassifiedRegistryConstants(): string[] {
  const configured = new Set([
    ...Object.entries(REGISTRY_FILES).flatMap(([file, list]) => list.map(({ name }) => `${file}#${name}`)),
    ...Object.keys(RULE_PARAMETER_CONSTANTS),
  ]);
  return readdirSync(join(REPO_ROOT, CONVENTIONS))
    .filter((file) => /\.tsx?$/.test(file))
    .flatMap((file) => exceptionNamedConstants(file, headSource(file)).map((name) => `${file}#${name}`))
    .filter((constant) => !configured.has(constant));
}

export function staleRuleParameterConstants(): string[] {
  return Object.keys(RULE_PARAMETER_CONSTANTS).filter((constant) => {
    const [file, name] = constant.split("#");
    try {
      return !exceptionNamedConstants(file, headSource(file)).includes(name);
    } catch {
      return true;
    }
  });
}
