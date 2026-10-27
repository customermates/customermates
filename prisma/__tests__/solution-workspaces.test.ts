import { describe, expect, it } from "vitest";

import { SOLUTION_CATALOG, SOLUTION_DATA_LOCALES } from "@/core/solutions/solution-catalog";
import { presetId } from "@/features/records/crm-preset";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { DataViewStateSchema } from "@/core/data-view/data-view-state.schema";

import { SEED_IDS } from "../seeds/context";
import { messagingUnipileAccountId } from "../seeds/messaging/seed";
import { solutionContent } from "../seeds/solutions/define-solution";
import { SOLUTION_DEFINITIONS } from "../seeds/solutions/definitions";
import { solutionWorkspaceCreatedAt } from "../seeds/solutions/seed-solution";
import { solutionWorkspacePlan, solutionWorkspaceSlugs } from "../seeds/solutions/seed-solutions";
import { buildSolutionRecordData } from "../seeds/solutions/solution-data";
import { buildSolutionMessaging } from "../seeds/solutions/solution-messaging";
import { buildSolutionModel } from "../seeds/solutions/solution-model";
import { buildSolutionViews, buildSolutionWidgets, buildSolutionWiki } from "../seeds/solutions/solution-presentation";
import { SOLUTION_WORKSPACES, TEAM_SOLUTION_WORKSPACE } from "../seeds/solutions/solution-workspaces";
import { UNSUPPORTED_CLAIM_PATTERN, validateSolutionDefinition } from "../seeds/solutions/validate-solution";
import { SYNTHETIC_TIMELINE_SHIFT_MS, storyMoment } from "../seeds/timeline";

const plans = SOLUTION_WORKSPACES.map(solutionWorkspacePlan);

function built(index: number) {
  const { workspace, content, model } = plans[index];
  const data = buildSolutionRecordData(workspace, content, model);
  return {
    data,
    views: buildSolutionViews(workspace, content, model),
    widgets: buildSolutionWidgets(workspace, content),
    wiki: buildSolutionWiki(workspace, content),
    messaging: buildSolutionMessaging(workspace, content, data),
  };
}

describe("solution demo workspaces", () => {
  it("seeds one workspace per catalog solution and data locale, keeping the two former workspace ids", () => {
    expect(SOLUTION_WORKSPACES).toHaveLength(SOLUTION_CATALOG.length * SOLUTION_DATA_LOCALES.length);
    expect(SOLUTION_WORKSPACES).toHaveLength(18);
    for (const key of ["companyId", "slug", "tag", "roleId", "memberId", "subscriptionId"] as const)
      expect(new Set(SOLUTION_WORKSPACES.map((workspace) => workspace[key])).size, key).toBe(18);
    for (const workspace of SOLUTION_WORKSPACES) {
      expect(workspace.companyId).toBe(workspace.solution.companyIds[workspace.locale]);
      expect(workspace.slug).toBe(workspace.solution.workspaceSlugs[workspace.locale]);
    }
    expect(TEAM_SOLUTION_WORKSPACE).toMatchObject({
      companyId: SEED_IDS.company,
      locale: "en",
      tag: "0000",
      team: true,
    });
    expect(SOLUTION_WORKSPACES.filter((workspace) => workspace.team)).toEqual([TEAM_SOLUTION_WORKSPACE]);
    expect(
      SOLUTION_WORKSPACES.find((workspace) => workspace.companyId === SEED_IDS.secondWorkspaceCompany),
    ).toMatchObject({
      locale: "de",
      memberId: SEED_IDS.maxBergmannSecondWorkspaceUser,
      roleId: SEED_IDS.secondWorkspaceRole,
    });
    expect(solutionWorkspaceSlugs()).toEqual(SOLUTION_WORKSPACES.map(({ companyId, slug }) => ({ companyId, slug })));
  });

  it.each(SOLUTION_CATALOG.map((solution) => [solution.id] as const))(
    "builds a valid %s definition with the same structure in English and German",
    (id) => {
      expect(validateSolutionDefinition(SOLUTION_DEFINITIONS[id], { allowAccountDifference: id === "smb" })).toEqual(
        [],
      );
    },
  );

  it("replaces the former demo names in every workspace", () => {
    for (const { workspace, content } of plans) {
      const text = JSON.stringify(content);
      expect(text, workspace.slug).not.toMatch(/Northwind|Bergmann Steuern/);
      expect(content.companyName, workspace.slug).not.toMatch(/Bergmann/);
    }
    expect(new Set(plans.map(({ content }) => content.companyName)).size).toBe(18);
  });

  it("names every workspace after its solution and keeps the story company in the guide", () => {
    expect(new Set(plans.map(({ content }) => content.workspaceName)).size).toBe(18);
    for (const { workspace, content } of plans) {
      expect(content.workspaceName, workspace.slug).not.toBe(content.companyName);
      const guide = content.wiki.find((page) => page.kind === "guide");
      expect(guide?.markdown.join("\n"), workspace.slug).toContain(content.companyName.split(" ")[0]);
    }
    expect(plans.find(({ workspace }) => workspace.team)?.content.workspaceName).toBe("Small business");
  });

  it("gives every workspace routines and the team-type workspaces two colleagues", () => {
    for (const { workspace, content } of plans) {
      expect(content.routines?.length ?? 0, workspace.slug).toBeGreaterThanOrEqual(2);
      const colleagues = ["agencies", "sales-pipeline", "client-management"].includes(workspace.solution.id) ? 2 : 0;
      expect(content.members?.length ?? 0, workspace.slug).toBe(colleagues);
    }
  });

  it("never shows the contact photo URL as a view column", () => {
    for (const [index, { workspace }] of plans.entries()) {
      const avatar = presetId(workspace.companyId, "contact.avatarUrl");
      for (const view of built(index).views) expect(view.state.columnOrder, view.name).not.toContain(avatar);
    }
  });

  it("builds identical rows on every run, with unique ids inside each workspace and across shared tables", () => {
    const sharedIds = new Set<string>();
    for (const [index, { workspace }] of plans.entries()) {
      const first = built(index);
      const second = built(index);
      expect(JSON.stringify(second), workspace.slug).toBe(JSON.stringify(first));
      const recordIds = first.data.records.map((record) => `${record.typeId}:${record.id}`);
      expect(new Set(recordIds).size, workspace.slug).toBe(recordIds.length);
      expect(new Set(first.data.links.map((link) => link.id)).size).toBe(first.data.links.length);
      expect(new Set(first.data.history.map((entry) => entry.id)).size).toBe(first.data.history.length);
      for (const id of [...first.views, ...first.widgets, ...first.wiki].map((row) => row.id)) {
        expect(sharedIds.has(id), id).toBe(false);
        sharedIds.add(id);
      }
      for (const provider of first.messaging?.accounts ?? []) {
        const account = messagingUnipileAccountId(workspace.tag, provider);
        expect(sharedIds.has(account), account).toBe(false);
        sharedIds.add(account);
      }
    }
  });

  it("dates every record relative to the shifted story end, after the workspace was created", () => {
    for (const [index, { workspace, content }] of plans.entries()) {
      const created = solutionWorkspaceCreatedAt(workspace, content).getTime();
      for (const record of built(index).data.records) {
        expect(record.createdAt.getTime(), workspace.slug).toBeGreaterThan(created);
        expect(record.createdAt.getTime(), workspace.slug).toBeLessThanOrEqual(storyMoment(0).getTime());
        expect(record.updatedAt.getTime()).toBeGreaterThanOrEqual(record.createdAt.getTime());
      }
    }
    expect(SYNTHETIC_TIMELINE_SHIFT_MS % (7 * 86_400_000)).toBe(0);
  });

  it("stores valid saved views and dashboard measures", () => {
    for (const [index, { workspace }] of plans.entries()) {
      const { views, widgets } = built(index);
      expect(views.length, workspace.slug).toBeGreaterThanOrEqual(3);
      for (const view of views) expect(() => DataViewStateSchema.parse(view.state), view.name).not.toThrow();
      expect(widgets.filter((widget) => widget.kind === "chart").length).toBeGreaterThanOrEqual(4);
      for (const widget of widgets.filter((entry) => entry.measure))
        expect(() => RecordMeasureSchema.parse(widget.measure), widget.name).not.toThrow();
    }
  });

  it("links conversations to deals only explicitly", () => {
    for (const [index, { workspace, model }] of plans.entries()) {
      const deal = presetId(workspace.companyId, "deal");
      for (const relation of model.relationships.filter((entry) =>
        [entry.sourceTypeId, entry.targetTypeId].includes(deal),
      )) {
        expect(relation.messagesOnSource, workspace.slug).toBe(false);
        expect(relation.messagesOnTarget, workspace.slug).toBe(false);
      }
      const messaging = built(index).messaging;
      expect(messaging, workspace.slug).not.toBeNull();
      const content = solutionContent(SOLUTION_DEFINITIONS[workspace.solution.id], workspace.locale);
      expect(messaging?.threads.map((thread) => thread.links.length)).toEqual(
        content.messaging?.threads.map((thread) => thread.links?.length ?? 0),
      );
    }
  });

  it("keeps the record model free of fields that claim unsupported capabilities", () => {
    expect(UNSUPPORTED_CLAIM_PATTERN.test("Next invoice")).toBe(true);
    expect(UNSUPPORTED_CLAIM_PATTERN.test("Erinnerung am")).toBe(true);
    expect(UNSUPPORTED_CLAIM_PATTERN.test("Preisberechnung")).toBe(false);
    for (const { workspace, model } of plans) {
      for (const label of [
        ...model.types.flatMap((type) => [type.label, type.pluralLabel]),
        ...model.fields.filter((field) => !field.archived).map((field) => field.label),
      ])
        expect(UNSUPPORTED_CLAIM_PATTERN.test(label), `${workspace.slug}: ${label}`).toBe(false);
    }
  });

  it("keeps a model per data locale built from the localized starter lists", () => {
    for (const { workspace, content, model } of plans) {
      expect(buildSolutionModel(workspace.companyId, workspace.locale, content)).toEqual(model);
      expect(
        model.types.filter((type) => !type.embedded).map((type) => type.id),
        workspace.slug,
      ).toEqual(content.lists.map((list) => presetId(workspace.companyId, list.key)));
    }
  });

  it("gives the team workspace the records its routines and Trash fixtures refer to", () => {
    const team = plans.findIndex(({ workspace }) => workspace.team);
    const { data } = built(team);
    const deal = presetId(SEED_IDS.company, "deal");
    const organization = presetId(SEED_IDS.company, "organization");
    expect(
      data.history.some(
        (entry) =>
          entry.typeId === deal &&
          entry.recordId === "80000000-0000-4000-8000-000000000001" &&
          entry.kind === "record.updated",
      ),
    ).toBe(true);
    expect(
      data.history.some(
        (entry) =>
          entry.typeId === organization &&
          entry.recordId === "70000000-0000-4000-8000-000000000001" &&
          entry.kind === "record.created",
      ),
    ).toBe(true);
  });
});
