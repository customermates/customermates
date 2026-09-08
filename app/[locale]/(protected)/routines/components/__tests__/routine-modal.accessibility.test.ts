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

  it("uses a wide split without a wide tablist and retains a single body scroll owner", () => {
    const modal = read("routine-modal.tsx");
    const runDetail = read("routine-run-detail.tsx");
    const bodyTag = "<App" + "CardBody";

    expect(modal).toContain('size={isExistingRoutine && wide ? "5xl" : "lg"}');
    expect(modal).toContain('data-routine-layout="wide"');
    expect(modal).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]");
    expect(modal.split(bodyTag)).toHaveLength(5);
    expect(modal).not.toContain("overflow-y-auto");
    expect(runDetail).toContain("scrollable={false}");
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
