import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const EXPLICITLY_CLEARED = new Set(["AuthUser", "MessagingInboundEvent"]);

type Relation = { target: string; required: boolean; onDelete: string | null };
type Model = { name: string; scalars: Set<string>; relations: Relation[] };

function parseSchema(): Map<string, Model> {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const models = new Map<string, Model>();
  for (const [, name, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const model: Model = { name, scalars: new Set(), relations: [] };
    for (const line of body.split("\n")) {
      const field = /^\s+(\w+)\s+(\w+)(\[\]|\?)?(.*)$/.exec(line);
      if (!field) continue;
      const [, fieldName, type, modifier, rest] = field;
      const relation = /@relation\(([^)]*)\)/.exec(rest);
      if (relation && /fields:/.test(relation[1])) {
        model.relations.push({
          target: type,
          required: modifier === undefined,
          onDelete: /onDelete:\s*(\w+)/.exec(relation[1])?.[1] ?? null,
        });
      } else model.scalars.add(fieldName);
    }
    models.set(name, model);
  }
  return models;
}

const models = parseSchema();

function cascadesFromCompany(model: Model, seen: ReadonlySet<string> = new Set()): boolean {
  if (model.name === "Company") return true;
  if (seen.has(model.name)) return false;
  const visited = new Set([...seen, model.name]);

  return model.relations.some((relation) => {
    if (relation.onDelete !== "Cascade" || (!relation.required && relation.target !== "Company")) return false;
    const target = models.get(relation.target);
    return target !== undefined && cascadesFromCompany(target, visited);
  });
}

describe("workspace deletion reaches every company-scoped model", () => {
  const scoped = [...models.values()].filter((model) => model.scalars.has("companyId"));

  it("finds the company-scoped schema surface", () => {
    expect(scoped.length).toBeGreaterThan(50);
  });

  it("removes every company-scoped row through a required cascade from Company or an explicit cleanup", () => {
    const uncovered = scoped
      .filter((model) => !cascadesFromCompany(model) && !EXPLICITLY_CLEARED.has(model.name))
      .map((model) => model.name);

    expect(uncovered).toEqual([]);
  });

  it("keeps the explicit cleanups limited to models a cascade cannot reach", () => {
    const redundant = [...EXPLICITLY_CLEARED].filter((name) => {
      const model = models.get(name);
      return !model || cascadesFromCompany(model);
    });

    expect(redundant).toEqual([]);
  });

  it("keeps a session's selected workspace when the workspace disappears, so its open tabs notice", () => {
    const session = models.get("AuthSession");

    expect(session?.scalars.has("activeCompanyId")).toBe(true);
    expect(session?.relations.some((relation) => relation.target === "Company")).toBe(false);
  });
});
