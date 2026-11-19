import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { SOLUTION_CATALOG, SOLUTION_DATA_LOCALES } from "@/core/solutions/solution-catalog";
import { brandForeground, isBrandColor } from "@/features/workspace-brand/brand-color";
import { BRAND_LOGO_MAX_BYTES, brandLogoRefusal, sniffBrandLogoType } from "@/features/workspace-brand/brand-image";
import { BRAND_LOGO_KEY } from "@/features/workspace-brand/workspace-brand.schema";

import {
  SOLUTION_BRAND_ACCENTS,
  SOLUTION_BRAND_DIRECTORY,
  seedSolutionBrand,
  solutionBrand,
} from "../seeds/solutions/solution-brands";
import { SOLUTION_WORKSPACES } from "../seeds/solutions/solution-workspaces";

const LOGO_SIZE = 256;

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("demo workspace brands", () => {
  it("gives every workspace a valid accent colour and a PNG logo within the upload rules", () => {
    expect(SOLUTION_WORKSPACES).toHaveLength(SOLUTION_CATALOG.length * SOLUTION_DATA_LOCALES.length);
    for (const workspace of SOLUTION_WORKSPACES) {
      const brand = solutionBrand(workspace);
      expect(isBrandColor(brand.accentColor), workspace.slug).toBe(true);
      expect(brandForeground(brand.accentColor), workspace.slug).toBe("white");
      expect(brandLogoRefusal(brand.logo), workspace.slug).toBeNull();
      expect(sniffBrandLogoType(brand.logo), workspace.slug).toBe("image/png");
      expect(brand.logoType, workspace.slug).toBe("image/png");
      expect(brand.logo.length, workspace.slug).toBeGreaterThan(500);
      expect(brand.logo.length, workspace.slug).toBeLessThan(BRAND_LOGO_MAX_BYTES);
      expect(pngSize(brand.logo), workspace.slug).toEqual({ width: LOGO_SIZE, height: LOGO_SIZE });
      expect(brand.logoKey, workspace.slug).toMatch(BRAND_LOGO_KEY);
    }
  });

  it("gives every workspace its own logo key, which follows the image", () => {
    const keys = SOLUTION_WORKSPACES.map((workspace) => solutionBrand(workspace).logoKey);
    expect(new Set(keys).size).toBe(SOLUTION_WORKSPACES.length);
    for (const workspace of SOLUTION_WORKSPACES) {
      const brand = solutionBrand(workspace);
      expect(brand.logoKey, workspace.slug).toBe(
        `demo-${workspace.solution.id}-${workspace.locale}-${digest(brand.logo).slice(0, 16)}`,
      );
    }
  });

  it("shares one mark and accent between the locale workspaces of a solution and keeps the nine apart", () => {
    const perSolution = SOLUTION_CATALOG.map(({ id }) => {
      const brands = SOLUTION_WORKSPACES.filter((workspace) => workspace.solution.id === id).map(solutionBrand);
      expect(brands).toHaveLength(SOLUTION_DATA_LOCALES.length);
      expect(new Set(brands.map((brand) => brand.accentColor)).size, id).toBe(1);
      expect(new Set(brands.map((brand) => digest(brand.logo))).size, id).toBe(1);
      return { accent: brands[0].accentColor, logo: digest(brands[0].logo) };
    });
    expect(new Set(perSolution.map(({ accent }) => accent)).size).toBe(SOLUTION_CATALOG.length);
    expect(new Set(perSolution.map(({ logo }) => logo)).size).toBe(SOLUTION_CATALOG.length);
    expect(Object.keys(SOLUTION_BRAND_ACCENTS).toSorted()).toEqual(SOLUTION_CATALOG.map(({ id }) => id).toSorted());
  });

  it("commits one SVG source per mark, drawn on the accent colour without text", () => {
    const files = readdirSync(SOLUTION_BRAND_DIRECTORY).toSorted();
    expect(files).toEqual(SOLUTION_CATALOG.flatMap(({ id }) => [`${id}.png`, `${id}.svg`]).toSorted());
    for (const { id } of SOLUTION_CATALOG) {
      const source = join(SOLUTION_BRAND_DIRECTORY, `${id}.svg`);
      expect(existsSync(source), id).toBe(true);
      const svg = readFileSync(source, "utf8");
      expect(svg, id).toContain(`fill="${SOLUTION_BRAND_ACCENTS[id]}"`);
      expect(svg, id).toContain(`viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}"`);
      expect(svg, id).not.toMatch(/<text|<image|Gradient|<filter/u);
    }
  });

  it("writes the same brand row on every run", async () => {
    const upsert = vi.fn((input: { where: { companyId: string }; create: unknown; update: unknown }) => {
      void input;
      return Promise.resolve({});
    });
    const prisma = { companyBrand: { upsert } } as unknown as Parameters<typeof seedSolutionBrand>[0];
    for (const workspace of SOLUTION_WORKSPACES) await seedSolutionBrand(prisma, workspace);
    for (const workspace of SOLUTION_WORKSPACES) await seedSolutionBrand(prisma, workspace);
    expect(upsert).toHaveBeenCalledTimes(SOLUTION_WORKSPACES.length * 2);
    const calls = upsert.mock.calls.map(([input]) => input);
    for (const [index, workspace] of SOLUTION_WORKSPACES.entries()) {
      const brand = solutionBrand(workspace);
      const first = calls[index];
      expect(first.where, workspace.slug).toEqual({ companyId: workspace.companyId });
      expect(first.create, workspace.slug).toEqual({ companyId: workspace.companyId, ...brand });
      expect(first.update, workspace.slug).toEqual(brand);
      expect(calls[index + SOLUTION_WORKSPACES.length], workspace.slug).toEqual(first);
    }
  });
});
