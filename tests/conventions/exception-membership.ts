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

export const REVIEWED_EXCEPTION_ALLOWLIST: Readonly<Record<string, string>> = {
  "design-system.test.ts#COLOR_EXEMPTIONS: components/ai-connection/ai-client-logo.tsx":
    "unresolved C01: third-party brand mark in its own brand colors",
  "design-system.test.ts#COLOR_EXEMPTIONS: ee/messaging/email-settings.ts":
    "unresolved C01: email documents render without the app color tokens",
  "design-system.test.ts#COLOR_EXEMPTIONS: ee/messaging/email-styles.ts":
    "unresolved C01: email documents render without the app color tokens",
  "design-system.test.ts#COLOR_EXEMPTIONS: features/messaging/email-frame.tsx":
    "unresolved C01: email documents render without the app color tokens",
  "design-system.test.ts#INLINE_SVG_EXEMPTIONS: app/[locale]/(protected)/dashboard/components/widget-display-type-picker.tsx":
    "unresolved C01: data graphic or illustration, not an icon",
  "design-system.test.ts#INLINE_SVG_EXEMPTIONS: app/[locale]/(protected)/onboarding/wizard/components/onboarding-artwork.tsx":
    "unresolved C01: data graphic or illustration, not an icon",
  "design-system.test.ts#INLINE_SVG_EXEMPTIONS: app/components/agent-chat/usage-ring.tsx":
    "unresolved C01: data graphic or illustration, not an icon",
  "design-system.test.ts#INLINE_SVG_EXEMPTIONS: components/ai-connection/ai-client-logo.tsx":
    "unresolved C01: third-party brand mark in its own brand colors",
  "design-system.test.ts#NATIVE_TITLE_EXEMPTIONS: components/shared/locale-menu.tsx":
    "unresolved C01: no-JS language menu on public pages, outside the product UI",
  "design-unification.test.ts#TABLE_ROW_MENU_EXEMPTIONS: app/[locale]/(protected)/operator/components/users/operator-users-page-view.tsx":
    "unresolved C02: owner decides the operator row menu for guarded deletion",
  "design-unification.test.ts#TABLE_ROW_MENU_EXEMPTIONS: app/[locale]/(protected)/operator/components/workspaces/operator-workspaces-page-view.tsx":
    "unresolved C02: owner decides the operator row menu for guarded deletion",
  "design-unification.test.ts#NON_STANDARD_CHIP_ALLOWLIST: app/[locale]/(protected)/inbox/components/thread-settings.tsx":
    "unresolved C02: owner decides chip or Button; a fix changes the toolbar look",
  "design-unification.test.ts#HAND_BUILT_REVEAL_ALLOWLIST: components/data-view/column-resize-handle.tsx":
    "unresolved C02: resize and row-menu reveals need active-drag and coarse-pointer states",
  "design-unification.test.ts#HAND_BUILT_REVEAL_ALLOWLIST: components/data-view/row-actions.tsx":
    "unresolved C02: resize and row-menu reveals need active-drag and coarse-pointer states",
  "design-unification.test.ts#HAND_BUILT_REVEAL_ALLOWLIST: components/layout/resizable-panels.tsx":
    "unresolved C02: resize and row-menu reveals need active-drag and coarse-pointer states",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx [rules: submit-button]":
    "unresolved C03: message composer whose submit sends the message",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/settings/(account)/components/connect-upsell-modal.tsx [rules: cancel-label]":
    "unresolved C03: upgrade prompt; ConfirmDialog would replace its mobile drawer",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/settings/(account)/components/connect-upsell-modal.tsx [rules: footer-primitive]":
    "unresolved C03: upgrade prompt; ConfirmDialog would replace its mobile drawer",
  "form-footer-actions.test.ts#EXEMPT: app/[locale]/(protected)/test/overlays/overlay-gallery.tsx [rules: confirm-primitive]":
    "unresolved C03: test gallery that renders the raw confirm primitive",
  "form-footer-actions.test.ts#SAVE_LIKE_KEY_EXEMPT: DataTransfer.recordImport.update":
    "unresolved C03: labels a different action than Save",
  "form-footer-actions.test.ts#SAVE_LIKE_KEY_EXEMPT: Editor.confirm":
    "unresolved C03: labels a different action than Save",
  "form-footer-actions.test.ts#SAVE_LIKE_KEY_EXEMPT: Inbox.compose.saveDraft":
    "unresolved C03: labels a different action than Save",
  "form-footer-actions.test.ts#SAVE_LIKE_KEY_EXEMPT: Inbox.compose.updateDraft":
    "unresolved C03: labels a different action than Save",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.admitsHostedAiGlobalSpend on AgentUsageEvent":
    "unresolved C06: platform-wide hosted AI spend admission sums every workspace's reservations under the global admission lock",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.releaseStaleRetrievalReservations on AgentUsageEvent":
    "unresolved C06: the stale retrieval sweep releases expired reservations of every workspace when no companyId is given",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.deleteWorkspaceUnscoped on workflow.${table}, workflow.workflow_runs":
    "unresolved C06: operator workspace deletion removes workflow engine runs whose input names the deleted companyId",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.getUserSummaryUnscoped on AuthUser, User":
    "unresolved C06: operator console platform summary counts verified members across all workspaces",
  "raw-sql-tenancy.test.ts#ALLOWLIST: ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.listWorkspaceTagsUnscoped on Company":
    "unresolved C06: operator console lists the distinct workspace tags of all companies",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/records/prisma-record.repository.ts:PrismaRecordRepo.claimDueUnscoped on RecordOperation, RecordSchemaState":
    "unresolved C06: the record operation sweep leases due operations across workspaces with one FOR UPDATE SKIP LOCKED claim",
  "raw-sql-tenancy.test.ts#ALLOWLIST: features/user/prisma-user.repository.ts:PrismaUserRepo.findAuthUserCompanyIdForUpdateUnscoped on AuthUser":
    "unresolved C06: pre-tenant registration locks the signed-in AuthUser row by id to learn which workspace it is bound to",
  "raw-sql-tenancy.test.ts#ALLOWLIST: prisma/seeds/run.ts:runSyntheticSeed on AgentMessage":
    "unresolved C06: seed fix-up resets the global AgentMessage sequence to the highest seeded value",
  "ui-wording.test.ts#SHARED_ACTION_WORD_EXEMPTIONS: AgentChat.approval.rejectAction":
    "unresolved C08: the cancel-label footer rule reserves Common.actions.cancel for the shared footer",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Cancelled":
    "unresolved C08: German-only homonym the other locales do not distinguish",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Contact":
    "unresolved C08: German-only homonym the other locales do not distinguish",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Layout":
    "unresolved C08: German-only homonym the other locales do not distinguish",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Number":
    "unresolved C08: German-only homonym the other locales do not distinguish",
  "ui-wording.test.ts#GERMAN_TERM_EXEMPTIONS: Services":
    "unresolved C08: German-only homonym the other locales do not distinguish",
  "i18n-parity.test.ts#ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS: de:RecordWidgets.quarterLabel":
    "unresolved C09: valid cognate identical to English (policy conflict)",
  "i18n-parity.test.ts#ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS: fr:EntityTimeline.types.configuration":
    "unresolved C09: valid cognate identical to English (policy conflict)",
};

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
  const moves = git("diff", "-M", "-l0", "--name-status", base)
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
  return registryAdditions(file).filter((addition) => !(addition in REVIEWED_EXCEPTION_ALLOWLIST));
}

export function staleReviewedAdditions(): string[] {
  const additions = new Set(Object.keys(REGISTRY_FILES).flatMap(registryAdditions));
  return Object.keys(REVIEWED_EXCEPTION_ALLOWLIST).filter((addition) => !additions.has(addition));
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

const FOLLOW_UP = /^(?:I\d+ \(C\d{2}\)|unresolved C\d{2}: .+)$/;

export function reviewedAdditionsWithoutFollowUp(): string[] {
  return Object.entries(REVIEWED_EXCEPTION_ALLOWLIST)
    .filter(([, followUp]) => !FOLLOW_UP.test(followUp))
    .map(([addition]) => addition);
}
