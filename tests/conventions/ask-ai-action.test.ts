import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { ASK_AI_ACTION_CLASS } from "@/components/ui/ask-ai-action";

import { REPO_ROOT, readSourceText, walkFiles } from "./walk";

const SCANNED_DIRECTORIES = ["app", "components", "features", "ee"];

const OVERLAY_ICON_CONTROL_SURFACES = [
  "components/ui/overlay-contract.ts",
  "components/ui/dialog.tsx",
  "components/ui/drawer.tsx",
  "components/ui/sheet.tsx",
  "components/modal/app-modal-action.tsx",
];

const ASK_AI_LABEL_OWNERS = [
  "components/ui/ask-ai-action.tsx",
  "components/data-view/views/data-view-views-rail.tsx",
];

function sourceFiles() {
  return SCANNED_DIRECTORIES.flatMap((folder) =>
    walkFiles(
      join(REPO_ROOT, folder),
      (path) =>
        /\.(ts|tsx)$/.test(path) &&
        !path.includes("__tests__") &&
        !path.endsWith(".test.ts"),
    ),
  ).map((path) => ({
    path: relative(REPO_ROOT, path),
    text: readSourceText(path),
  }));
}

function read(path: string) {
  return readSourceText(join(REPO_ROOT, path));
}

describe("Ask AI and overlay header controls (rule 62)", () => {
  it("keeps the overlay icon-control style inside drawer and dialog headers", () => {
    const offenders = sourceFiles()
      .filter(({ text }) =>
        /\boverlayIconControlClass\b|\bOVERLAY_CLOSE_CLASS\b/.test(text),
      )
      .map(({ path }) => path)
      .filter((path) => !OVERLAY_ICON_CONTROL_SURFACES.includes(path));

    expect(
      offenders,
      "Page top bars use TopBarActionButtons, never the overlay header icon style",
    ).toEqual([]);
  });

  it("renders Ask AI only through the shared AskAiAction", () => {
    const owners = sourceFiles()
      .filter(({ text }) => text.includes("DataView.views.askAi"))
      .map(({ path }) => path)
      .sort();

    expect(owners).toEqual([...ASK_AI_LABEL_OWNERS].sort());
    expect(read("components/ui/ask-ai-action.tsx")).toContain('kind: "assistant"');
    expect(read("components/data-view/views/data-view-views-rail.tsx")).toMatch(
      /<DropdownMenuItem[^>]*id="global-data-views-ai"/,
    );
    expect(read("components/modal/app-modal-action.tsx")).toContain(
      "if (isAskAiAction(props) && props.onClick) return <AskAiAction id={props.anchorId} onClick={props.onClick} />;",
    );
    expect(read("components/shared/top-bar-action-buttons.tsx")).toContain(
      'return <AskAiAction id={action.anchorId} placement="topbar" onClick={action.onClick} />;',
    );
  });

  it("keeps Ask AI the quietest control: muted text, no box", () => {
    expect(ASK_AI_ACTION_CLASS).toContain("text-muted-foreground");
    expect(ASK_AI_ACTION_CLASS).toContain("hover:text-foreground");
    expect(ASK_AI_ACTION_CLASS).not.toMatch(
      /(^|\s)(hover:)?(bg-|border|shadow)/,
    );
  });

  it("places Ask AI first in its action group", () => {
    expect(read("components/modal/app-modal-action.tsx")).toMatch(
      /ACTION_KIND_ORDER[^{]*\{\s*assistant: 0,/,
    );
    const configureActions = read(
      "app/[locale]/(protected)/configure/components/configure-actions.tsx",
    );
    const groups = configureActions
      .split('<div className="flex shrink-0 items-center gap-1">')
      .slice(1);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups)
      expect(group.trimStart().startsWith("{ai}")).toBe(true);
  });
});
