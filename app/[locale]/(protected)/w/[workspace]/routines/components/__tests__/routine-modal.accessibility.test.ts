import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROUTINE_COMPONENTS = join(process.cwd(), "app/[locale]/(protected)/w/[workspace]/routines/components");

function read(name: string): string {
  return readFileSync(join(ROUTINE_COMPONENTS, name), "utf8");
}

describe("routine modal accessibility contract", () => {
  it("switches compact details and runs with the shared segmented control", () => {
    const source = read("routine-modal.tsx");

    expect(source).toContain('idPrefix="routine"');
    expect(source).toContain('<SegmentedControlPanel className="mt-0" value="details">');
    expect(source).toContain('<SegmentedControlPanel className="mt-0" value="runs">');
  });

  it("uses owner status and viewer role for read-only guidance", () => {
    const configuration = read("routine-configuration-pane.tsx");
    const emptyState = read("routine-empty-state.tsx");
    const store = read("routine-modal.store.ts");

    expect(store).toContain('this.form.owner?.status === "active"');
    expect(configuration).toContain("USER_STATUS_COLORS_MAP[form.owner.status]");
    expect(configuration).toContain("RoutineDetail.ownerUnavailableReadOnly");
    expect(configuration).toContain("RoutineDetail.ownerPermissionReadOnly");
    expect(configuration).toContain("{store.isReadOnly && (");
    expect(configuration).toContain("store.isOwner && !store.canManage");
    expect(configuration).not.toContain("{store.isOwner ? (");
    expect(configuration).toContain('form.enabled ? t("RoutineModal.enabledHelp") : t("RoutineModal.pausedHelp")');
    expect(configuration).not.toContain('Alert color="warning"');
    expect(configuration).not.toContain("disabledReasonCopy");
    expect(emptyState).toContain("const testDescription = !store.canManage");
    expect(emptyState).toContain("RoutineDetail.ownerPermissionReadOnly");
    expect(emptyState).not.toContain("const testDescription = !store.isOwner");
  });

  it("renders the routine on the shared automation canvas and replays runs in its panel", () => {
    const modal = read("routine-modal.tsx");
    const runsPane = read("routine-runs-pane.tsx");
    const runDetail = read("routine-run-detail.tsx");

    expect(modal).toContain("<AutomationDrawerShell");
    expect(modal).toContain("<AutomationCanvas actions={canvasActions} steps={steps} />");
    expect(modal).toContain('data-routine-layout="run"');
    expect(modal).toContain("<AutomationReplayBanner");
    expect(modal).toContain('routineModalStore.onChange("enabled", enabled)');
    expect(modal).toMatch(/openRun \? undefined : \(\s*<UnsavedChangesBar/);
    expect(runsPane).not.toContain("sticky top-0");
    expect(runsPane).not.toContain("border-b");
    expect(runDetail).toContain("<AgentConversationLog");
    expect(modal).toContain("scrollContainerRef={runScrollRef}");
    expect(runDetail).toContain("scrollContainerRef={scrollContainerRef}");
    expect(runDetail).toContain("scrollFooterRef={composerContainerRef}");
    expect(runDetail).toContain('"sticky bottom-0 z-10 bg-background"');
    expect(runDetail).not.toContain("sticky bottom-0 z-10 bg-card");
    expect(runDetail).not.toContain('aria-labelledby="routine-run-detail-heading"');
    expect(modal).toContain("startRefreshTransition(() => router.refresh())");
    expect(modal).toContain("routineRunChatStore.markRouteSyncComplete()");
    expect(runDetail).toContain("<AgentComposer");
    expect(runDetail).toContain('composerId: "routine-run-agent-composer"');
    expect(runDetail).toContain('usageId: "routine-run-agent-usage"');
    expect(runDetail).toContain("run.status !== RoutineRunStatus.queued");
    expect(runDetail).toContain("run.status !== RoutineRunStatus.running");
    expect(runDetail).toContain("transcriptLoading ?");
    expect(runDetail).toContain(": transcriptFailed ?");
    expect(runDetail).toContain("store.openRun(run)");
    expect(runDetail).toContain("RoutineDetail.transcriptOwnerOnly");
    expect(runDetail).toContain("useAgentChatConfig(routineRunChatStore, transcriptSelected)");
  });

  it("keeps new routines configuration-only and restores focus after run drilldown", () => {
    const modal = read("routine-modal.tsx");
    const store = read("routine-modal.store.ts");

    expect(modal).toContain('data-routine-layout="create"');
    expect(modal).toContain("<RoutineConfigurationPane");
    expect(store).toContain("this.focusAfterRender(`routine-run-${runId}`");
    expect(store).toContain('"routine-runs-heading", "routine-tab-runs"');
  });
});
