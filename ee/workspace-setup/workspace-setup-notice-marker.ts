import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupRecord } from "./workspace-setup.schema";
import type { SetupNotice, SetupNoticeStage, WorkspaceSetupNotifier } from "./workspace-setup-notifier";

import { z } from "zod";

import { dueSetupNotice } from "./workspace-setup-notifier";

export const SETUP_SENT_NOTICES_ARTIFACT = "sentNotices";

const SentNoticesSchema = z.record(z.string(), z.string());

function setupNoticeKey(setup: Pick<WorkspaceSetupRecord, "planRevision" | "finishedAt">, notice: SetupNotice) {
  return notice === "planReady" || notice === "planFailed"
    ? `plan:${setup.planRevision}`
    : `build:${setup.finishedAt?.toISOString() ?? ""}`;
}

function sentNotices(setup: Pick<WorkspaceSetupRecord, "artifacts">): Record<string, string> {
  const parsed = SentNoticesSchema.safeParse(setup.artifacts[SETUP_SENT_NOTICES_ARTIFACT]);
  return parsed.success ? parsed.data : {};
}

export async function notifyWorkspaceSetupOnce(
  repo: Pick<WorkspaceSetupRepo, "mutate" | "workspaceDeleting">,
  notifier: Pick<WorkspaceSetupNotifier, "send">,
  setupId: string,
  stage: SetupNoticeStage,
  now = new Date(),
): Promise<SetupNotice | null> {
  if (await repo.workspaceDeleting()) return null;
  const due: { notice: SetupNotice | null } = { notice: null };
  const claimed = await repo.mutate(setupId, (current) => {
    const notice = dueSetupNotice(current, stage, now);
    const key = notice ? setupNoticeKey(current, notice) : null;
    if (!notice || !key || sentNotices(current)[notice] === key) return null;
    due.notice = notice;
    return {
      artifacts: { ...current.artifacts, [SETUP_SENT_NOTICES_ARTIFACT]: { ...sentNotices(current), [notice]: key } },
    };
  });
  const { notice } = due;
  if (!claimed?.changed || !notice) return null;
  if (await notifier.send(notice)) return notice;
  const key = sentNotices(claimed.setup)[notice];
  await repo.mutate(setupId, (current) => {
    const { [notice]: sent, ...rest } = sentNotices(current);
    return sent === key ? { artifacts: { ...current.artifacts, [SETUP_SENT_NOTICES_ARTIFACT]: rest } } : null;
  });
  return null;
}
