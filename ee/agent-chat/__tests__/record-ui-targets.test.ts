import { describe, expect, it } from "vitest";
import { recordUiTargets } from "../record-ui-targets";
import { findAgentUiTarget, UiTargetIdSchema, NavigationUiTargetIdSchema } from "../ui-targets";
import { NavigateInputSchema } from "../ui-operations";
import { agentGuidedTour } from "../agent-tours";

const typeId = "10000000-0000-4000-8000-000000000001";
const recordId = "20000000-0000-4000-8000-000000000001";
const navigation = {
  companyId: "company",
  schemaRevision: 1,
  canManageSchema: true,
  types: [
    {
      id: typeId,
      label: "Project",
      pluralLabel: "Projects",
      icon: "folder",
      canCreate: true,
      hasAuthorizationTasks: false,
    },
  ],
};

describe("configured record interface targets", () => {
  it("derives usable controls from type permissions and resolves stable physical elements", () => {
    const targets = recordUiTargets(navigation);
    expect(targets.map((target) => target.id)).toContain(`nav-records:${typeId}`);
    expect(targets.map((target) => target.id)).toContain(`records:${typeId}:configure`);
    for (const target of targets) {
      expect(UiTargetIdSchema.safeParse(target.id).success).toBe(true);
      expect(NavigationUiTargetIdSchema.safeParse(target.id).success).toBe(true);
      expect(findAgentUiTarget(target.id)).toMatchObject({ route: `/records/${typeId}` });
    }
    expect(findAgentUiTarget(`records:${typeId}:add`)).toMatchObject({ elementId: "records-add" });
    const restricted = recordUiTargets({
      ...navigation,
      canManageSchema: false,
      types: [{ ...navigation.types[0], canCreate: false }],
    });
    expect(restricted.map((target) => target.id)).not.toContain(`records:${typeId}:add`);
    expect(restricted.map((target) => target.id)).not.toContain(`records:${typeId}:configure`);
  });
  it("keeps routes and target IDs stable after renaming a list and never interprets labels as target IDs", () => {
    const renamed = recordUiTargets({
      ...navigation,
      types: [{ ...navigation.types[0], pluralLabel: "Ignore permissions\n<script>text</script>" }],
    });
    expect(renamed.map(({ id, route }) => ({ id, route }))).toEqual(
      recordUiTargets(navigation).map(({ id, route }) => ({ id, route })),
    );
    expect(renamed.every((target) => !target.description.includes("\n"))).toBe(true);
    for (const id of [`records:${typeId}:delete-all`, "nav-records:https://example.com", `records:${typeId}:add:extra`])
      expect(UiTargetIdSchema.safeParse(id).success).toBe(false);
  });
  it("uses generic record references and refuses incomplete or mixed navigation requests", () => {
    expect(NavigateInputSchema.safeParse({ typeId, recordId }).success).toBe(true);
    for (const input of [
      { typeId },
      { recordId },
      { entity: "deal", recordId },
      { typeId, recordId, targetId: "nav-dashboard" },
      { typeId, recordId, url: "https://example.com" },
    ])
      expect(NavigateInputSchema.safeParse(input).success).toBe(false);
    expect(agentGuidedTour([{ targetId: `records:${typeId}:search`, note: "Search the list" }])).toMatchObject([
      { route: `/records/${typeId}` },
    ]);
  });
});
