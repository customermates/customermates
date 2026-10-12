import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const protectedRoot = "app/[locale]/(protected)";

function pagesUnder(directory: string): string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return pagesUnder(path);
      return entry.name === "page.tsx" ? [path] : [];
    },
  );
}

describe("protected page reads", () => {
  it("unwrap interactor results through unwrapPage so a not_found failure renders the not-found page", () => {
    const offenders = pagesUnder(protectedRoot).filter((path) =>
      readFileSync(resolve(root, path), "utf8").includes("unwrapValidated"),
    );
    expect(offenders).toEqual([]);
  });
});
