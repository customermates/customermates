import { existsSync,readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";
import { REPO_ROOT } from "./walk";

describe("retired entity implementations", () => {
  it.each(["contacts", "organizations", "deals", "services", "tasks"])("has no %s route, action or feature module", (kind) => {
    const route = join(REPO_ROOT, "app/[locale]/(protected)", kind);
    expect(existsSync(route)).toBe(false);
    expect(existsSync(join(REPO_ROOT, "features", kind))).toBe(false);
    expect(existsSync(join(REPO_ROOT, "app/api/v1", kind))).toBe(false);
  });
  it("removes retired shared write actions and calculators", () => {
    for (const file of ["features/relations/modify-entity-relation.interactor.ts", "features/widget/calculator", "components/data-view/custom-columns/custom-column-modal.store.ts", "app/[locale]/(protected)/data-transfer/actions.ts"]) expect(existsSync(join(REPO_ROOT, file)), file).toBe(false);
    const actions = readFileSync(join(REPO_ROOT, "app/actions.ts"), "utf8");
    for (const name of ["getCustomColumnRepo", "upsertCustomColumnAction", "bulkDeleteEntitiesAction", "updateEntityCustomFieldValueAction"]) expect(actions).not.toContain(name);
  });
});
