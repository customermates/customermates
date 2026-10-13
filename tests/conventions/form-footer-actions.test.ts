import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";
import { unreviewedExceptionAdditions } from "./exception-membership";

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
  "confirm-primitive": /from "[^"]*\/ui\/alert-dialog"/,
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

const EDITOR_RULES = new Set<Rule>(["footer-primitive", "submit-button", "overlay-footer"]);
const SAVE_LIKE_LABEL = /^(?:Save|Update|Apply)(?: \S+){0,2}$/;
const EDITOR_LABEL = /^(?:Cancel|Discard)$/;
const EDITOR_STATE = /\bhasUnsavedChanges\b|["'`]Common\.actions\.(?:save|cancel|discard)["'`]/;
const TRANSLATION_KEY = /\bt\(\s*["'`]([\w.]+)["'`]/g;

function flattenMessages(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (Array.isArray(value) || typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => flattenMessages(child, prefix ? `${prefix}.${key}` : key));
}

const ENGLISH = new Map(
  flattenMessages(JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", "en.json"), "utf8")) as unknown),
);

function isSaveCancelEditor(source: string, messages: ReadonlyMap<string, string> = ENGLISH) {
  if (EDITOR_STATE.test(source)) return true;
  return [...source.matchAll(TRANSLATION_KEY)].some(([, key]) => {
    const label = messages.get(key);
    return label !== undefined && (SAVE_LIKE_LABEL.test(label) || EDITOR_LABEL.test(label));
  });
}

const EXEMPT: Record<string, { rules: Rule[]; reason: string }> = {
  "app/[locale]/(protected)/test/overlays/overlay-gallery.tsx": {
    rules: ["confirm-primitive"],
    reason: "test-only gallery that renders the raw overlay primitives",
  },
  "app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx": {
    rules: ["submit-button"],
    reason: "message composer whose submit sends the message",
  },
  "app/[locale]/(protected)/settings/(account)/components/connect-upsell-modal.tsx": {
    rules: ["footer-primitive", "cancel-label"],
    reason: "upgrade prompt with a plans call to action, not a save form",
  },
};

const NOT_YET_MIGRATED: Record<string, Rule[]> = {};

function scannedFiles(): string[] {
  return SCANNED_DIRECTORIES.flatMap((directory) =>
    walkFiles(join(REPO_ROOT, directory), (path) => path.endsWith(".tsx") && !path.includes("__tests__")),
  ).filter((path) => !relative(REPO_ROOT, path).startsWith("components/ui/"));
}

function violatedRules(file: string, source: string, messages: ReadonlyMap<string, string> = ENGLISH): Rule[] {
  const editor = isSaveCancelEditor(source, messages);
  return (Object.keys(RULE_PATTERNS) as Rule[]).filter((rule) => {
    if (RULE_OWNERS[rule].has(file)) return false;
    if (EDITOR_RULES.has(rule) && !editor) return false;
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

const SAVE_LIKE_KEY_EXEMPT: Record<string, string> = {
  "Inbox.compose.saveDraft": "keeps a message as a draft instead of sending it, a different action than Save",
  "Inbox.compose.updateDraft": "keeps a message as a draft instead of sending it, a different action than Save",
  "Editor.confirm": "inserts a link into the text being edited; nothing is persisted",
  "DataTransfer.recordImport.update": "names an import mode option, not a button",
};
const SAVE_LIKE_KEY_NOT_YET_MIGRATED = new Set<string>([]);

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

  it("applies the footer rules to save and cancel editors, not to call-to-action cards", () => {
    const messages = new Map([
      ["Auth.signIn", "Sign in"],
      ["Profile.update", "Update profile"],
      ["Filters.clear", "Clear"],
    ]);
    const card = '<AppCardFooter><Button type="submit">{t("Auth.signIn")}</Button></AppCardFooter>';
    const editor = '<AppCardFooter><Button type="submit">{t("Profile.update")}</Button></AppCardFooter>';
    const guarded = 'const dirty = store.hasUnsavedChanges;\n<DialogFooter>{t("Filters.clear")}</DialogFooter>';
    const cancelling = '<SheetFooter><Button>{t("Common.actions.cancel")}</Button></SheetFooter>';
    const confirm = 'import { AlertDialog } from "@/components/ui/alert-dialog";';
    expect(violatedRules("card.tsx", card, messages)).toEqual([]);
    expect(violatedRules("editor.tsx", editor, messages)).toEqual(["footer-primitive", "submit-button"]);
    expect(violatedRules("guarded.tsx", guarded, messages)).toEqual(["footer-primitive"]);
    expect(violatedRules("cancelling.tsx", cancelling, messages)).toEqual(["cancel-label", "footer-primitive"]);
    expect(violatedRules("confirm.tsx", confirm, messages)).toEqual(["confirm-primitive"]);
  });
});

describe("exception membership against the review base", () => {
  it("adds no exception members beyond the review base and the reviewed additions", () => {
    expect(unreviewedExceptionAdditions("form-footer-actions.test.ts")).toEqual([]);
  });
});
