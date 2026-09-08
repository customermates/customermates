import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROUTINE_COMPONENTS = join(process.cwd(), "app/[locale]/(protected)/routines/components");

function read(name: string): string {
  return readFileSync(join(ROUTINE_COMPONENTS, name), "utf8");
}

describe("routine modal accessibility contract", () => {
  it("keeps compact details and runs in real Radix tab panels", () => {
    const source = read("routine-modal.tsx");
    const tabsContent = "Tabs" + "Content";

    expect(source).toContain('<TabsTrigger id="routine-tab-details" value="details">');
    expect(source).toContain('<TabsTrigger id="routine-tab-runs" value="runs">');
    expect(source).toContain(`<${tabsContent} className="mt-0" value="details">`);
    expect(source).toContain(`<${tabsContent} className="mt-0" value="runs">`);
  });

  it("uses owner status and viewer role for read-only guidance", () => {
    const configuration = read("routine-configuration-pane.tsx");
    const store = read("routine-modal.store.ts");

    expect(store).toContain('this.form.owner?.status === "active"');
    expect(configuration).toContain("USER_STATUS_COLORS_MAP[form.owner.status]");
    expect(configuration).toContain("RoutineDetail.ownerUnavailableReadOnly");
    expect(configuration).toContain("RoutineDetail.disabledRepeatedFailuresReadOnly");
    expect(configuration).toContain("RoutineDetail.disabledOwnerUnavailable");
  });

  it("uses a divider-free wide split and full-modal run drilldown", () => {
    const modal = read("routine-modal.tsx");
    const runsPane = read("routine-runs-pane.tsx");
    const runDetail = read("routine-run-detail.tsx");
    const bodyTag = "<App" + "CardBody";

    expect(modal).toContain('size={isExistingRoutine && wide ? "5xl" : "lg"}');
    expect(modal).toContain('data-routine-layout="wide"');
    expect(modal).toContain("gap-6 lg:min-h-[36rem] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]");
    expect(modal).toContain('data-routine-layout="run"');
    expect(modal).toContain("{!openRun && <FormActions");
    expect(modal.split(bodyTag)).toHaveLength(5);
    expect(modal).not.toContain("border-l");
    expect(modal).not.toContain("overflow-y-hidden!");
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
    expect(modal.indexOf("isExistingRoutine && wide")).toBeLessThan(modal.indexOf("<Tabs"));
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
