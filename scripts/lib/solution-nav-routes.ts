import type { SolutionCapturePlanItem } from "@/core/solutions/solution-captures";

import {
  type SolutionCatalogEntry,
  type SolutionDataLocale,
  solutionDataLocaleForUiLocale,
} from "@/core/solutions/solution-catalog";
import { presetId } from "@/features/records/crm-preset";
import { workspaceFixtureId } from "@/prisma/seeds/helpers";
import { type SolutionContent, solutionContent } from "@/prisma/seeds/solutions/define-solution";
import { SOLUTION_DEFINITIONS } from "@/prisma/seeds/solutions/definitions";
import { buildSolutionRecordData } from "@/prisma/seeds/solutions/solution-data";
import { buildSolutionModel } from "@/prisma/seeds/solutions/solution-model";
import { buildSolutionViews } from "@/prisma/seeds/solutions/solution-presentation";
import { type SolutionWorkspace, findSolutionWorkspace } from "@/prisma/seeds/solutions/solution-workspaces";

export const MESSAGING_THREAD_FIXTURE_GROUP = "17000000";

export const NAV_PREVIEW_FALLBACK_PATH = "/dashboard";

export type SolutionNavPreviewPath = { path: string; fallback?: string };

function fallback(reason: string): SolutionNavPreviewPath {
  return { fallback: reason, path: NAV_PREVIEW_FALLBACK_PATH };
}

function inboxPath(
  workspace: SolutionWorkspace,
  content: SolutionContent,
  account: string,
  link: string | undefined,
): SolutionNavPreviewPath {
  const threads = content.messaging?.threads ?? [];
  const ofAccount = threads.flatMap((thread, index) => (thread.account === account ? [index] : []));
  if (ofAccount.length === 0) return fallback(`no ${account} conversation`);
  const linked = link ? ofAccount.find((index) => threads[index].links?.includes(link)) : undefined;
  if (link && linked === undefined) return fallback(`no ${account} conversation linked to ${link}`);
  const index = linked ?? ofAccount[0];
  return { path: `/inbox?threadId=${workspaceFixtureId(MESSAGING_THREAD_FIXTURE_GROUP, workspace.tag, index + 1)}` };
}

export function solutionNavPreviewPath(
  solution: SolutionCatalogEntry,
  dataLocale: SolutionDataLocale,
): SolutionNavPreviewPath {
  const target = solution.navPreview;
  if (target.kind === "dashboard") return { path: "/dashboard" };
  if (target.kind === "configure") return { path: "/configure" };

  const workspace = findSolutionWorkspace(solution.id, dataLocale);
  const content = solutionContent(SOLUTION_DEFINITIONS[solution.id], dataLocale);
  if (target.kind === "inbox") return inboxPath(workspace, content, target.account, target.link);

  const model = buildSolutionModel(workspace.companyId, dataLocale, content);

  if (target.kind === "view") {
    const index = content.views.findIndex((view) => view.key === target.view);
    if (index < 0) return fallback(`no view ${target.view}`);
    const row = buildSolutionViews(workspace, content, model)[index];
    return { path: `/records/${presetId(workspace.companyId, content.views[index].list)}?view=${row.id}` };
  }

  const ref = buildSolutionRecordData(workspace, content, model).ids.get(`${target.list}:${target.key}`);
  if (!ref) return fallback(`no record ${target.list}:${target.key}`);
  return { path: `/records/${ref.typeId}/${ref.recordId}` };
}

export function solutionNavPreview(solution: SolutionCatalogEntry, uiLocale: string): SolutionNavPreviewPath {
  const dataLocale = solutionDataLocaleForUiLocale(uiLocale);
  const resolved = solutionNavPreviewPath(solution, dataLocale);
  return { ...resolved, path: `/${uiLocale}/w/${solution.workspaces[dataLocale].slug}${resolved.path}` };
}

export function solutionNavRouteForPlanItem(item: SolutionCapturePlanItem): string {
  return solutionNavPreview(item.solution, item.locale).path;
}
