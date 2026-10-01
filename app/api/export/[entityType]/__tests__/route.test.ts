import { describe, expect, it } from "vitest";
import { POST } from "../route";
describe("retired CRM endpoint", () => {
  it("returns a version-two migration response", async () => {
    const response = POST();
    expect(response.status).toBe(410);
    expect(JSON.stringify(await response.json())).toContain("/api/v2");
  });
});
