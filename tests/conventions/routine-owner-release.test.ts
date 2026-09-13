import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

// A routine may only run as an active owner. That invariant used to be a plpgsql BEFORE trigger on
// "User", which caught every write including ones the application never made. It now lives in
// ReleaseOwnerRoutinesInteractor, so it only holds where an interactor calls it. These two lists are
// the price of that move: a new way to take a user off active status has to appear here, and has to
// release the owner's routines, or the invariant silently stops holding.
const USER_STATUS_WRITERS = [
  "ee/operator/prisma-operator.repository.ts",
  "features/user/prisma-user.repository.ts",
];

const RELEASE_CALLERS = [
  "ee/lifecycle/deactivate-trial-users-and-send-notice.interactor.ts",
  "ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor.ts",
  "ee/operator/update-operator-user-status.interactor.ts",
  "features/user/upsert/admin-update-user-details.interactor.ts",
];

const USER_STATUS_WRITE = /prisma\.user\.update(?:Many)?\(\{[\s\S]{0,600}?\bstatus:/;

function productionFiles() {
  return walkFiles(REPO_ROOT, (path) => {
    if (!path.endsWith(".ts") || path.endsWith(".d.ts")) return false;
    const repoPath = relative(REPO_ROOT, path);
    return (
      !repoPath.includes("/__tests__/") &&
      !repoPath.startsWith("tests/") &&
      !repoPath.startsWith("scripts/") &&
      !repoPath.startsWith("prisma/seeds/") &&
      !repoPath.includes(".test.")
    );
  });
}

describe("routine owner release", () => {
  it("knows every production site that writes a user status", () => {
    const found = productionFiles()
      .filter((path) => USER_STATUS_WRITE.test(readFileSync(path, "utf8")))
      .map((path) => relative(REPO_ROOT, path))
      .sort();

    expect(found).toEqual([...USER_STATUS_WRITERS].sort());
  });

  it("releases the owner's routines from every interactor that can take a user off active", () => {
    const found = productionFiles()
      .filter((path) => readFileSync(path, "utf8").includes("releaseOwnerRoutines.invoke("))
      .map((path) => relative(REPO_ROOT, path))
      .sort();

    expect(found).toEqual([...RELEASE_CALLERS].sort());
  });

  it("keeps the release reason the same one the routine list renders", () => {
    const interactor = readFileSync(`${REPO_ROOT}/ee/routines/prisma-routine.repository.ts`, "utf8");

    expect(interactor).toContain("disabledReason: ROUTINE_DISABLED_REASON_OWNER_UNAVAILABLE");
  });
});
