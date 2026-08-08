import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const SCANNED_DIRECTORIES = ["app", "components", "features", "ee", "core", "workflows"];

/**
 * CUS-60 pins the overlay contract that shadcn does not ship: every overlay derives its
 * block size from the dynamic-viewport tokens in styles/globals.css, and every floating
 * surface goes through a collision-aware primitive rather than positioning itself.
 *
 * Only rules that are mechanically decidable live here. Notably absent, on purpose:
 *
 *  - "exactly one scroll owner per overlay" is undecidable statically, because whether a
 *    second container is actually scrollable depends on content height at runtime. That
 *    is asserted in the browser harness instead.
 *  - a repo-wide `vw` ban would fire on legitimate marketing layout.
 *  - banning inline `style={{ top, left }}` would fire on every legitimate inline style;
 *    there is no reliable way to tell positioning from theming.
 */

/**
 * Block-axis only. `vh` is the large viewport on mobile, so it overflows below the fold
 * whenever browser chrome is showing, and it does not shrink for the on-screen keyboard.
 * Inline-axis `vw` has no equivalent failure mode and stays allowed for width clamps.
 */
const LEGACY_VIEWPORT_UNIT = /\b(?:max-|min-)?h-(?:\[[^\]]*?\dvh\b[^\]]*\]|screen\b)/;
const RAW_SAFE_AREA = /env\(\s*safe-area-inset-/;
const FIXED_FLOATING_SURFACE = /"[^"]*\bfixed\b[^"]*\bz-\d/;
const DETACHED_ABSOLUTE_PANEL = /"[^"]*\babsolute\b[^"]*\btop-full\b[^"]*"/;

/**
 * Raw `fixed` surfaces that are not overlays and must stay hand-positioned. Each entry is
 * a repo-relative path; the stale-allowlist test below fails if one stops matching.
 */
const FIXED_SURFACE_ALLOWLIST = new Set([
  "components/ui/dialog.tsx",
  "components/ui/sheet.tsx",
  "components/ui/drawer.tsx",
  "components/ui/alert-dialog.tsx",
  "components/ui/sidebar.tsx",
  "components/shared/loading-overlay.tsx",
  "app/[locale]/loading.tsx",
  "app/components/agent-chat/agent-chat.tsx",
  "app/components/agent-chat/agent-tour-overlay.tsx",
]);

const PRIMITIVE_DEFAULTS: { file: string; mustContain: string[] }[] = [
  {
    file: "components/ui/popover.tsx",
    mustContain: [
      "max-h-(--radix-popover-content-available-height)",
      "max-w-(--radix-popover-content-available-width)",
      "collisionPadding",
      "popover-footer",
    ],
  },
  {
    file: "components/ui/dropdown-menu.tsx",
    mustContain: [
      "max-h-(--radix-dropdown-menu-content-available-height)",
      "max-w-(--radix-dropdown-menu-content-available-width)",
      "calc(var(--radix-dropdown-menu-content-available-width,100dvw)",
      "collisionPadding",
    ],
  },
  {
    file: "components/ui/select.tsx",
    mustContain: [
      "max-h-(--radix-select-content-available-height)",
      "--radix-select-content-available-width",
      'position = "popper"',
      "collisionPadding",
      "sideOffset = 4",
    ],
  },
  {
    file: "components/ui/tooltip.tsx",
    mustContain: ["--radix-tooltip-content-available-width", "collisionPadding"],
  },
  { file: "components/ui/dialog.tsx", mustContain: ["max-h-(--overlay-block-budget)"] },
  { file: "components/ui/alert-dialog.tsx", mustContain: ["max-h-(--overlay-block-budget)"] },
  { file: "components/ui/sheet.tsx", mustContain: ["max-h-(--sheet-block-budget)", "sheet-body"] },
  { file: "components/ui/drawer.tsx", mustContain: ["max-h-(--sheet-block-budget)", "drawer-body"] },
];

const CONTROLLED_FOCUS_RETURN_SURFACES = [
  "app/components/app-sidebar.tsx",
  "components/modal/app-modal.tsx",
  "components/entity-detail/entity-drawer.tsx",
  "components/modal/unsaved-changes-guard.tsx",
  "components/modal/delete-confirmation-modal.tsx",
  "components/ui/command.tsx",
];

const DOCUMENTED_OVERLAY_TYPES = [
  "Tooltip",
  "Dropdown menu",
  "Select",
  "Popover",
  "AppModal",
  "AlertDialog",
  "Sheet",
  "Drawer",
  "CommandDialog",
];

const OVERLAY_FOOTER_COMPONENTS = [
  "DialogFooter",
  "DrawerFooter",
  "SheetFooter",
  "AlertDialogFooter",
  "PopoverFooter",
];

const OVERLAY_FOOTER_DIVIDER = new RegExp(
  `<(?:${OVERLAY_FOOTER_COMPONENTS.join("|")})\\b(?:(?!>).)*\\bborder-(?:t|b)\\b(?:(?!>).)*>`,
  "gs",
);

const SHARED_OVERLAY_FOOTERS = [
  ["components/card/app-card-footer.tsx", "AppCardFooter"],
  ["components/ui/dialog.tsx", "DialogFooter"],
  ["components/ui/drawer.tsx", "DrawerFooter"],
  ["components/ui/sheet.tsx", "SheetFooter"],
  ["components/ui/alert-dialog.tsx", "AlertDialogFooter"],
  ["components/ui/popover.tsx", "PopoverFooter"],
] as const;

function sourceFiles() {
  return SCANNED_DIRECTORIES.flatMap((directory) =>
    walkFiles(join(REPO_ROOT, directory), (path) => /\.tsx?$/.test(path)),
  );
}

type Line = { file: string; line: number; text: string };

function allLines(): Line[] {
  const lines: Line[] = [];
  for (const absolute of sourceFiles()) {
    const file = relative(REPO_ROOT, absolute);
    const text = readFileSync(absolute, "utf8");
    text.split("\n").forEach((raw, index) => lines.push({ file, line: index + 1, text: raw }));
  }
  return lines;
}

const LINES = allLines();

function violations(match: (line: Line) => boolean, skip: (file: string) => boolean = () => false) {
  return LINES.filter((line) => !skip(line.file) && match(line)).map(
    (line) => `${line.file}:${line.line}: ${line.text.trim().slice(0, 160)}`,
  );
}

function sourcePatternViolations(pattern: RegExp) {
  const found: string[] = [];

  for (const absolute of sourceFiles()) {
    const file = relative(REPO_ROOT, absolute);
    const text = readFileSync(absolute, "utf8");

    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const line = text.slice(0, match.index).split("\n").length;
      found.push(`${file}:${line}: ${match[0].replace(/\s+/g, " ").slice(0, 160)}`);
    }
  }

  return found;
}

function functionSource(file: string, functionName: string) {
  const text = readFileSync(join(REPO_ROOT, file), "utf8");
  const start = text.indexOf(`function ${functionName}(`);
  if (start === -1) return "";

  const next = text.indexOf("\nfunction ", start + 1);
  return text.slice(start, next === -1 ? text.length : next);
}

const APP_MODAL_HEADER = /<AppCardHeader\b[^>]*>[\s\S]*?<\/AppCardHeader>/g;
const INTERACTIVE_HEADER_DESCENDANT =
  /<(?:AppModalAction|Button|button|a|Link|IntlLink|Checkbox|Switch|[A-Z][A-Za-z]+Trigger)\b/;

function appModalHeaderActionViolations(sources: { file: string; text: string }[]) {
  const found: string[] = [];

  for (const { file, text } of sources) {
    if (!text.includes("<AppModal")) continue;

    for (const match of text.matchAll(APP_MODAL_HEADER)) {
      if (!INTERACTIVE_HEADER_DESCENDANT.test(match[0])) continue;

      const line = text.slice(0, match.index).split("\n").length;
      found.push(`${file}:${line}: ${match[0].replace(/\s+/g, " ").slice(0, 160)}`);
    }
  }

  return found;
}

describe("overlay contract", () => {
  it("keeps the decision guide beside the shared primitives", () => {
    const guide = readFileSync(join(REPO_ROOT, "components/ui/overlay-contract.md"), "utf8");

    for (const type of DOCUMENTED_OVERLAY_TYPES) expect(guide).toContain(`**${type}**`);
    expect(guide).toContain("../../tests/conventions/overlay-contract.test.ts");
    expect(guide).toContain("Preferred patterns:");
    expect(guide).toContain("Prohibited patterns:");
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("uses no legacy viewport units", () => {
    const found = violations((line) => LEGACY_VIEWPORT_UNIT.test(line.text));

    expect(found, `Use the overlay tokens or svh/dvh instead of vh/vw/screen:\n${found.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("reads safe-area insets through the shared tokens", () => {
    const found = violations((line) => RAW_SAFE_AREA.test(line.text));

    expect(found, `Use var(--safe-top|right|bottom|left) from styles/globals.css:\n${found.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("routes floating surfaces through a collision-aware primitive", () => {
    const found = violations(
      (line) => FIXED_FLOATING_SURFACE.test(line.text),
      (file) => FIXED_SURFACE_ALLOWLIST.has(file),
    );

    expect(found, `Compose Popover, Dialog, Sheet or Drawer instead of a raw fixed layer:\n${found.join("\n")}`).toEqual(
      [],
    );
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has no detached absolute dropdown panels", () => {
    const found = violations((line) => DETACHED_ABSOLUTE_PANEL.test(line.text));

    expect(
      found,
      `An absolute top-full panel is clipped by scrolling ancestors and cannot flip. Use Popover:\n${found.join("\n")}`,
    ).toEqual([]);
  });

  it("pins the viewport contract", () => {
    const layout = readFileSync(join(REPO_ROOT, "app/layout.tsx"), "utf8");

    expect(layout).toContain('viewportFit: "cover"');
    expect(layout).toContain('interactiveWidget: "resizes-content"');
    expect(layout).not.toContain("maximumScale");
    expect(layout).not.toContain("userScalable");
  });

  it("pins the shared primitive defaults", () => {
    const missing: string[] = [];

    for (const { file, mustContain } of PRIMITIVE_DEFAULTS) {
      const text = readFileSync(join(REPO_ROOT, file), "utf8");
      for (const needle of mustContain) if (!text.includes(needle)) missing.push(`${file}: missing ${needle}`);
    }

    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("keeps task overlay headers left-aligned", () => {
    const contract = readFileSync(join(REPO_ROOT, "components/ui/overlay-contract.ts"), "utf8");
    expect(contract).toContain('OVERLAY_HEADER_ALIGNMENT_CLASS = "text-left"');

    for (const file of ["dialog.tsx", "drawer.tsx", "sheet.tsx", "popover.tsx", "alert-dialog.tsx"]) {
      const primitive = readFileSync(join(REPO_ROOT, "components/ui", file), "utf8");
      expect(primitive, `${file} must reuse the shared header alignment`).toContain("OVERLAY_HEADER_ALIGNMENT_CLASS");
    }

    const dialog = readFileSync(join(REPO_ROOT, "components/ui/dialog.tsx"), "utf8");
    const drawer = readFileSync(join(REPO_ROOT, "components/ui/drawer.tsx"), "utf8");
    const alertDialog = readFileSync(join(REPO_ROOT, "components/ui/alert-dialog.tsx"), "utf8");
    const appCardHeader = readFileSync(join(REPO_ROOT, "components/card/app-card-header.tsx"), "utf8");

    expect(dialog).not.toContain("text-center sm:text-left");
    expect(drawer).not.toContain("drawer-content:text-center");
    expect(alertDialog).not.toContain("place-items-center");
    expect(appCardHeader).toContain("OVERLAY_HEADER_ALIGNMENT_CLASS");
  });

  it("keeps AppModal actions in the shared top-right action row", () => {
    const sources = sourceFiles().map((absolute) => ({
      file: relative(REPO_ROOT, absolute),
      text: readFileSync(absolute, "utf8"),
    }));
    const found = appModalHeaderActionViolations(sources);
    const appModal = readFileSync(join(REPO_ROOT, "components/modal/app-modal.tsx"), "utf8");
    const appModalAction = readFileSync(join(REPO_ROOT, "components/modal/app-modal-action.tsx"), "utf8");
    const appCardHeader = readFileSync(join(REPO_ROOT, "components/card/app-card-header.tsx"), "utf8");
    const dialog = readFileSync(join(REPO_ROOT, "components/ui/dialog.tsx"), "utf8");
    const drawer = readFileSync(join(REPO_ROOT, "components/ui/drawer.tsx"), "utf8");
    const sheet = readFileSync(join(REPO_ROOT, "components/ui/sheet.tsx"), "utf8");
    const overlayContract = readFileSync(join(REPO_ROOT, "components/ui/overlay-contract.ts"), "utf8");

    expect(
      found,
      `AppModal headers contain titles and metadata only. Pass controls through <AppModal actions={...}>:\n${found.join("\n")}`,
    ).toEqual([]);
    expect(appModal).toContain("actions?: AppModalActions");
    expect(appModal).toContain("actions.map((action)");
    expect(appModal).toContain('data-slot="app-modal-actions"');
    expect(appModal).toContain("data-overlay-action-count={hasActions");
    expect(appModal).toContain("data-overlay-actions={hasActions");
    expect(appModalAction).toContain("OVERLAY_ICON_CONTROL_CLASS");
    expect(appModalAction).toContain('data-slot="app-modal-action"');
    expect(appModalAction).toContain('data-size="icon"');
    expect(appModalAction).toContain("OVERLAY_ACTION_RAIL_CLASS");
    expect(overlayContract).toContain("size-9");
    expect(overlayContract).toContain("[&_svg]:size-4");
    expect(overlayContract).toContain("`absolute ${OVERLAY_ICON_CONTROL_CLASS}");
    expect(dialog).toContain("OVERLAY_CLOSE_POSITION_CLASS");
    expect(drawer).toContain("OVERLAY_CLOSE_POSITION_CLASS");
    expect(sheet).toContain("OVERLAY_SAFE_CLOSE_POSITION_CLASS");
    expect(appCardHeader).toContain("in-data-[overlay-action-count=1]:pr-24!");
    expect(appCardHeader).toContain("in-data-[overlay-action-count=2]:pr-36!");
    expect(drawer).toContain("group-data-[overlay-actions]/drawer-content:hidden!");

    expect(
      appModalHeaderActionViolations([
        {
          file: "bad.tsx",
          text: "<AppModal><AppCardHeader><h2>Title</h2><Button>Delete</Button></AppCardHeader></AppModal>",
        },
      ]),
    ).toHaveLength(1);
    expect(
      appModalHeaderActionViolations([
        {
          file: "good.tsx",
          text: '<AppModal actions={[{ id: "delete", icon: Trash2, label: "Delete", onClick: remove }]}><AppCardHeader><h2>Title</h2></AppCardHeader></AppModal>',
        },
      ]),
    ).toEqual([]);
  });

  it("keeps delegated sheet card footers above the bottom safe area", () => {
    const appCardFooter = readFileSync(join(REPO_ROOT, "components/card/app-card-footer.tsx"), "utf8");

    expect(appCardFooter).toContain(
      "in-data-[overlay-surface=sheet]:pb-[calc(1.5rem+var(--safe-bottom))]",
    );
  });

  it("keeps task-overlay headers and action footers divider-free", () => {
    const entityDetail = readFileSync(join(REPO_ROOT, "components/entity-detail/entity-detail-body.tsx"), "utf8");
    const responsiveOverlay = readFileSync(join(REPO_ROOT, "components/modal/responsive-overlay.tsx"), "utf8");
    const footerViolations = sourcePatternViolations(OVERLAY_FOOTER_DIVIDER);

    expect(
      footerViolations,
      `Overlay action footers stay visually continuous with their surface:\n${footerViolations.join("\n")}`,
    ).toEqual([]);
    expect(entityDetail).not.toMatch(/<AppCardFooter[^>]*\bborder-(?:t|b)\b/);
    expect(responsiveOverlay).not.toMatch(/<PopoverHeader[^>]*\bborder-b\b/);

    for (const [file, functionName] of SHARED_OVERLAY_FOOTERS) {
      const source = functionSource(file, functionName);
      expect(source, `${functionName} must exist in ${file}`).not.toBe("");
      expect(source, `${functionName} must not add an internal divider`).not.toMatch(/\bborder-(?:t|b)\b/);
    }
  });

  it("pins focus return for controlled overlays without primitive triggers", () => {
    const hook = readFileSync(join(REPO_ROOT, "components/ui/use-overlay-focus-return.ts"), "utf8");
    const focusTarget = readFileSync(join(REPO_ROOT, "components/ui/overlay-focus-target.ts"), "utf8");

    expect(hook).toContain("openRef.current = open");
    expect(hook).toContain("previousOpenRef.current = open");
    expect(hook).toContain("capturedRef.current");
    expect(hook).toContain("usableOverlayFocusTarget(document.activeElement)");
    expect(hook).toContain("if (openRef.current === true) return");
    expect(hook).toContain("generationRef.current !== generation");
    expect(hook).not.toContain("addEventListener(");

    expect(focusTarget).toContain("WeakRef<HTMLElement>");
    expect(focusTarget).toContain("document.getElementById(target.id)");
    expect(focusTarget).toContain("candidate.getClientRects().length === 0");
    expect(focusTarget).toContain("[data-overlay-surface][data-state='closed']");
    expect(focusTarget).toContain("element.focus({ preventScroll: true })");

    const entityDrawerStack = readFileSync(
      join(REPO_ROOT, "components/entity-detail/hooks/use-entity-drawer-stack.ts"),
      "utf8",
    );
    expect(entityDrawerStack).toContain(
      "stack.length === 0) rememberEntityDrawerInvoker(preferredInvoker, fallbackInvoker)",
    );
    expect(entityDrawerStack).toContain("stack.length === 1) prepareEntityDrawerInvokerRestore()");
    expect(entityDrawerStack).toContain("focusOverlayTarget(entityDrawerInvoker, entityDrawerFallback)");
    expect(entityDrawerStack).not.toContain("document.getElementById(");
    expect(entityDrawerStack).not.toContain(".focus(");
    expect(entityDrawerStack).not.toContain("window.setTimeout(");

    const entityDrawer = readFileSync(join(REPO_ROOT, "components/entity-detail/entity-drawer.tsx"), "utf8");
    expect(entityDrawer).toContain("if (focusEntityDrawerInvoker())");
    expect(entityDrawer).toContain("focusReturn.onCloseAutoFocus(event)");

    const appSidebar = readFileSync(join(REPO_ROOT, "app/components/app-sidebar.tsx"), "utf8");
    expect(appSidebar).toContain("globalSearchModalStore.openFrom(invoker");
    expect(appSidebar).toContain("feedbackModalStore.openFrom(invoker");
    expect(appSidebar).toContain('document.getElementById("sidebar-trigger")');
    expect(appSidebar).toContain("if (isHandingOffRef.current)");

    const missing = CONTROLLED_FOCUS_RETURN_SURFACES.filter(
      (file) => !readFileSync(join(REPO_ROOT, file), "utf8").includes("useOverlayFocusReturn("),
    );

    expect(missing, `Controlled overlays missing focus return:\n${missing.join("\n")}`).toEqual([]);
  });

  it("defines the overlay tokens exactly once", () => {
    const css = readFileSync(join(REPO_ROOT, "styles/globals.css"), "utf8");

    for (const token of ["--viewport-block", "--overlay-block-budget", "--sheet-block-budget"])
      expect(css).toContain(`${token}:`);

    expect(css).toContain("@supports (height: 1dvh)");
  });

  it("sees the expected overlay surface", () => {
    expect(LINES.length).toBeGreaterThan(20000);
    expect(LINES.some((line) => line.file === "components/ui/dialog.tsx")).toBe(true);
    expect(LINES.some((line) => FIXED_FLOATING_SURFACE.test(line.text))).toBe(true);
    expect(LINES.some((line) => line.text.includes("--radix-popover-content-available-width"))).toBe(true);
  });

  it("keeps the fixed-surface allowlist free of stale entries", () => {
    const stale = [...FIXED_SURFACE_ALLOWLIST].filter(
      (file) => !LINES.some((line) => line.file === file && FIXED_FLOATING_SURFACE.test(line.text)),
    );

    expect(stale, `No longer a raw fixed surface, drop from the allowlist:\n${stale.join("\n")}`).toEqual([]);
  });

  it("detects the contract violations in synthetic sources", () => {
    const probe = [
      `const a = "max-h-[90vh] flex";`,
      `const b = "h-screen";`,
      `const c = "fixed z-50 rounded-md";`,
      `const d = "absolute inset-x-0 top-full z-50";`,
      `const e = "max-h-(--overlay-block-budget)";`,
      `const f = "padding-top: env(safe-area-inset-top)";`,
      `const prose = "the layout is fixed and the height is one screen";`,
    ];

    expect(probe.filter((line) => LEGACY_VIEWPORT_UNIT.test(line))).toEqual([probe[0], probe[1]]);
    expect(probe.filter((line) => FIXED_FLOATING_SURFACE.test(line))).toEqual([probe[2]]);
    expect(probe.filter((line) => DETACHED_ABSOLUTE_PANEL.test(line))).toEqual([probe[3]]);
    expect(probe.filter((line) => RAW_SAFE_AREA.test(line))).toEqual([probe[5]]);
  });
});
