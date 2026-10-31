import { describe, expect, it } from "vitest";

import { isDeploymentSkewError } from "../deployment-skew";

describe("deployment skew", () => {
  it("recognizes the client and server Server Action mismatch errors", () => {
    const client = Object.assign(new Error('Server Action "40b4" was not found on the server.'), {
      name: "UnrecognizedActionError",
    });
    const server = new Error("Failed to find Server Action. This request might be from an older or newer deployment.");
    expect(isDeploymentSkewError(client)).toBe(true);
    expect(isDeploymentSkewError(server)).toBe(true);
    expect(isDeploymentSkewError(new Error("Record was not found on the server"))).toBe(false);
  });
});
