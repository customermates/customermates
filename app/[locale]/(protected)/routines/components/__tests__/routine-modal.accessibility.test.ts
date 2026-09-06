import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROUTINE_COMPONENTS = join(process.cwd(), "app/[locale]/(protected)/routines/components");

function read(name: string): string {
  return readFileSync(join(ROUTINE_COMPONENTS, name), "utf8");
}

describe("routine modal accessibility contract", () => {
  it("associates both tab triggers with Radix tab panels", () => {
    const source = read("routine-modal.tsx");

    expect(source).toContain("<TabsContent");
    expect(source).toContain('<RoutineTabPanel enabled={isExistingRoutine} value="details">');
    expect(source).toContain('<RoutineTabPanel enabled={isExistingRoutine} value="runs">');
  });

  it("uses owner status and viewer role for read-only guidance", () => {
    const modal = read("routine-modal.tsx");
    const store = read("routine-modal.store.ts");

    expect(store).toContain('this.form.owner?.status === "active"');
    expect(modal).toContain("USER_STATUS_COLORS_MAP[form.owner.status]");
    expect(modal).toContain("RoutineDetail.ownerUnavailableReadOnly");
    expect(modal).toContain("RoutineDetail.disabledRepeatedFailuresReadOnly");
    expect(modal).toContain("RoutineDetail.disabledOwnerUnavailable");
  });

  it("keeps owner details compact and gives the routine form more room", () => {
    const modal = read("routine-modal.tsx");

    expect(modal).toContain('size="lg"');
    expect(modal).toContain("{!routineModalStore.isOwner && (");
    expect(modal).not.toContain("RoutineDetail.ownerAccessTitle");
    expect(modal).not.toContain('RoutineDetail.ownerAccess"');
  });
});
