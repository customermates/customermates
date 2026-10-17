import { expect, it, vi } from "vitest";

vi.mock("@/env", () => {
  throw new Error("the homepage product stage imported the server environment");
});

it("loads the homepage product stage in the browser bundle without the server environment", async () => {
  await expect(import("@/app/[locale]/(static)/components/homepage-product-stage")).resolves.toHaveProperty(
    "HomepageProductStage",
  );
});
