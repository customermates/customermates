import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

type Rule =
  | "save-label"
  | "cancel-label"
  | "footer-primitive"
  | "overlay-footer"
  | "submit-button"
  | "confirm-primitive"
  | "archive-switch"
  | "legacy-footer";

const SCANNED_DIRECTORIES = ["app", "components", "features", "ee"];

const SHARED_FOOTER = "components/forms/form-footer-actions.tsx";
const SHARED_CONFIRM = "components/modal/confirm-dialog.tsx";

const FOOTER_PRIMITIVE_OWNERS = new Set([
  SHARED_FOOTER,
  SHARED_CONFIRM,
  "components/card/app-card-footer.tsx",
  "components/modal/responsive-overlay.tsx",
]);

const SHARED_SAVE_KEY = "Common.actions.save";

const RULE_PATTERNS: Record<Rule, RegExp> = {
  "save-label": /["'`]Common\.actions\.save["'`]/,
  "cancel-label": /["'`]Common\.actions\.cancel["'`]/,
  "footer-primitive":
    /\b(?:AppCardFooter|DialogFooter|DrawerFooter|SheetFooter|AlertDialogFooter|PopoverFooter)\b(?![-\w])/,
  "overlay-footer": /<ResponsiveOverlay\b[^]*?\bfooter=\{/,
  "submit-button": /<Button\b(?:=>|[^>])*\btype="submit"/,
  "confirm-primitive": /from "[^"]*\/(?:ui\/alert-dialog|unsaved-changes-guard)"/,
  "archive-switch": /<(?:Form)?Switch\b(?:=>|[^>])*?(?:\barchive|Archive)/,
  "legacy-footer": /from "[^"]*\/form-actions"|\bexport const FormActions\b/,
};

const RULE_OWNERS: Record<Rule, ReadonlySet<string>> = {
  "save-label": new Set([SHARED_FOOTER]),
  "cancel-label": new Set([SHARED_FOOTER, SHARED_CONFIRM]),
  "footer-primitive": FOOTER_PRIMITIVE_OWNERS,
  "overlay-footer": new Set(),
  "submit-button": new Set(),
  "confirm-primitive": new Set([SHARED_CONFIRM]),
  "archive-switch": new Set(),
  "legacy-footer": new Set(),
};

const RENDERS_SHARED_FOOTER = /<FormFooterActions\b/;

const EXEMPT: Record<string, { rules: Rule[]; reason: string }> = {
  "app/[locale]/(public)/auth/signin/sign-in-form.tsx": {
    rules: ["footer-primitive", "submit-button"],
    reason: "auth page card whose only action is the sign-in call to action, not a save form",
  },
  "app/[locale]/(public)/auth/signup/sign-up-form.tsx": {
    rules: ["footer-primitive", "submit-button"],
    reason: "auth page card whose only action is the sign-up call to action, not a save form",
  },
  "app/[locale]/(public)/auth/forgot-password/forgot-password-form.tsx": {
    rules: ["footer-primitive", "submit-button"],
    reason: "auth page card that sends a reset link, not a save form",
  },
  "app/[locale]/(public)/auth/reset-password/reset-password-form.tsx": {
    rules: ["footer-primitive", "submit-button"],
    reason: "auth page card that sets a new password and signs in, not a save form",
  },
  "app/[locale]/(public)/auth/invitation/invitation-card.tsx": {
    rules: ["footer-primitive"],
    reason: "auth page card with join and sign-out calls to action",
  },
  "app/[locale]/(public)/auth/mcp-consent/mcp-consent-card.tsx": {
    rules: ["footer-primitive"],
    reason: "OAuth consent card with deny and approve decisions",
  },
  "app/[locale]/(public)/auth/pending/pending-card.tsx": {
    rules: ["footer-primitive"],
    reason: "auth status card with refresh and sign-out calls to action",
  },
  "app/[locale]/(public)/auth/verify-email/verify-email-card.tsx": {
    rules: ["footer-primitive"],
    reason: "auth status card with a single call to action",
  },
  "app/[locale]/(static)/contact/contact-form.tsx": {
    rules: ["footer-primitive", "submit-button"],
    reason: "public website contact form that sends a message",
  },
  "app/[locale]/(protected)/legal-update/components/legal-update-view.tsx": {
    rules: ["footer-primitive"],
    reason: "blocking legal acceptance page with accept and retry calls to action",
  },
  "app/[locale]/(protected)/subscription-expired/components/subscription-expired-view.tsx": {
    rules: ["footer-primitive"],
    reason: "blocking status page with contact and retry calls to action",
  },
  "app/[locale]/(protected)/onboarding/join/join-workspace-card.tsx": {
    rules: ["footer-primitive"],
    reason: "onboarding step card with a back call to action",
  },
  "app/[locale]/(protected)/onboarding/onboarding-choice-card.tsx": {
    rules: ["submit-button"],
    reason: "onboarding choice tiles that each submit one decision",
  },
  "app/[locale]/(protected)/onboarding/wizard/components/onboarding-wizard.tsx": {
    rules: ["footer-primitive"],
    reason: "onboarding wizard step navigation (Back, Next), not a save form",
  },
  "app/[locale]/(protected)/onboarding/wizard/components/step-ai.tsx": {
    rules: ["footer-primitive"],
    reason: "onboarding wizard step navigation (Back, Finish), not a save form",
  },
  "app/[locale]/(protected)/onboarding/wizard/components/step-profile.tsx": {
    rules: ["submit-button"],
    reason: "onboarding wizard step that continues to the next step",
  },
  "components/wiki/wiki-homepage-setup.tsx": {
    rules: ["submit-button"],
    reason: "onboarding knowledge base setup that starts a generation run",
  },
  "components/shared/error-page-view.tsx": {
    rules: ["footer-primitive"],
    reason: "error page card with recovery links",
  },
  "components/shared/not-found-page-view.tsx": {
    rules: ["footer-primitive"],
    reason: "not-found page card with recovery links",
  },
  "components/shared/locked-feature-overlay.tsx": {
    rules: ["footer-primitive"],
    reason: "upgrade card with a single call to action",
  },
  "components/ai-elements/message.tsx": {
    rules: ["footer-primitive"],
    reason: "chat message bubble footer, not a form",
  },
  "app/[locale]/(protected)/test/overlays/overlay-gallery.tsx": {
    rules: ["footer-primitive", "overlay-footer", "confirm-primitive"],
    reason: "test-only gallery that renders the raw overlay primitives",
  },
  "app/[locale]/(protected)/company/components/company-invite/invite-by-email-form.tsx": {
    rules: ["submit-button"],
    reason: "sends invitations, an action form without saved state",
  },
  "app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx": {
    rules: ["submit-button"],
    reason: "message composer whose submit sends the message",
  },
  "components/data-view/header/filter-popover.tsx": {
    rules: ["overlay-footer"],
    reason: "filters apply immediately; the footer only holds Clear",
  },
  "app/[locale]/(protected)/profile/components/connect-upsell-modal.tsx": {
    rules: ["footer-primitive", "cancel-label"],
    reason: "upgrade prompt with a plans call to action, not a save form",
  },
};

const NOT_YET_MIGRATED: Record<string, Rule[]> = {
  "components/card/form-actions.tsx": ["save-label", "footer-primitive", "submit-button", "legacy-footer"],
  "app/[locale]/(protected)/company/components/feedback/feedback-modal.tsx": [
    "save-label",
    "cancel-label",
    "footer-primitive",
    "submit-button",
  ],
  "app/[locale]/(protected)/company/components/role/role-modal.tsx": ["legacy-footer"],
  "app/[locale]/(protected)/company/components/user/user-modal.tsx": ["legacy-footer"],
  "app/[locale]/(protected)/company/components/webhook/webhook-modal.tsx": ["legacy-footer"],
  "app/[locale]/(protected)/profile/components/profile-settings-form.tsx": ["legacy-footer"],
  "app/[locale]/(protected)/profile/components/account-signature.tsx": ["submit-button"],
  "app/[locale]/(protected)/profile/components/api-key-modal.tsx": [
    "save-label",
    "cancel-label",
    "footer-primitive",
    "submit-button",
  ],
  "app/components/navigation/sidebar-customize.tsx": ["overlay-footer"],
  "app/[locale]/(protected)/configure/components/configure-actions.tsx": ["legacy-footer"],
  "app/[locale]/(protected)/configure/components/configure-list-pane.tsx": ["legacy-footer"],
  "app/[locale]/(protected)/configure/components/model-change-sheet.tsx": ["footer-primitive", "confirm-primitive"],
};

function scannedFiles(): string[] {
  return SCANNED_DIRECTORIES.flatMap((directory) =>
    walkFiles(join(REPO_ROOT, directory), (path) => path.endsWith(".tsx") && !path.includes("__tests__")),
  ).filter((path) => !relative(REPO_ROOT, path).startsWith("components/ui/"));
}

function violatedRules(file: string, source: string): Rule[] {
  return (Object.keys(RULE_PATTERNS) as Rule[]).filter((rule) => {
    if (RULE_OWNERS[rule].has(file)) return false;
    if (!RULE_PATTERNS[rule].test(source)) return false;
    if (rule === "overlay-footer") return !RENDERS_SHARED_FOOTER.test(source);
    return true;
  });
}

function findings() {
  return scannedFiles().flatMap((path) => {
    const file = relative(REPO_ROOT, path);
    return violatedRules(file, readFileSync(path, "utf8")).map((rule) => ({
      file,
      rule,
    }));
  });
}

function isAllowed(file: string, rule: Rule) {
  return Boolean(EXEMPT[file]?.rules.includes(rule) || NOT_YET_MIGRATED[file]?.includes(rule));
}

function flattenMessages(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (Array.isArray(value) || typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => flattenMessages(child, prefix ? `${prefix}.${key}` : key));
}

const SAVE_LIKE_LABEL = /^(?:Save|Update|Apply)(?: \S+){0,2}$/;
const SAVE_LIKE_KEY_EXEMPT: Record<string, string> = {
  "Inbox.compose.saveDraft": "keeps a message as a draft instead of sending it, a different action than Save",
  "Inbox.compose.updateDraft": "keeps a message as a draft instead of sending it, a different action than Save",
  "Editor.confirm": "inserts a link into the text being edited; nothing is persisted",
  "DataTransfer.recordImport.update": "names an import mode option, not a button",
};
const SAVE_LIKE_KEY_NOT_YET_MIGRATED = new Set<string>([
  "ConnectedAccountsCard.emailSave",
  "MassActions.update",
]);

describe("footer actions follow one shared component (design rules 30, 31, 35)", () => {
  const current = findings();

  it("builds every drawer, dialog and form footer with FormFooterActions or ConfirmDialog", () => {
    const violations = current.filter(({ file, rule }) => !isAllowed(file, rule)).map((f) => `${f.rule}: ${f.file}`);
    expect(violations).toEqual([]);
  });

  it("keeps the not-yet-migrated allowlist shrinking", () => {
    const stale = Object.entries(NOT_YET_MIGRATED).flatMap(([file, rules]) =>
      rules
        .filter((rule) => !current.some((f) => f.file === file && f.rule === rule))
        .map((rule) => `${rule}: ${file}`),
    );
    expect(stale).toEqual([]);
  });

  it("keeps every exemption justified by a current match", () => {
    const stale = Object.entries(EXEMPT).flatMap(([file, { rules }]) =>
      rules
        .filter((rule) => !current.some((f) => f.file === file && f.rule === rule))
        .map((rule) => `${rule}: ${file}`),
    );
    expect(stale).toEqual([]);
  });

  it("labels the save action with the one shared key", () => {
    const messages = JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", "en.json"), "utf8")) as unknown;
    const saveLike = flattenMessages(messages)
      .filter(([key, value]) => key !== SHARED_SAVE_KEY && SAVE_LIKE_LABEL.test(value))
      .map(([key]) => key)
      .filter((key) => !(key in SAVE_LIKE_KEY_EXEMPT) && !SAVE_LIKE_KEY_NOT_YET_MIGRATED.has(key));
    expect(saveLike).toEqual([]);
  });

  it("keeps the save-label allowlist shrinking", () => {
    const messages = flattenMessages(
      JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", "en.json"), "utf8")) as unknown,
    );
    const stale = [...SAVE_LIKE_KEY_NOT_YET_MIGRATED, ...Object.keys(SAVE_LIKE_KEY_EXEMPT)].filter(
      (key) => !messages.some(([candidate, value]) => candidate === key && SAVE_LIKE_LABEL.test(value)),
    );
    expect(stale).toEqual([]);
  });
});
