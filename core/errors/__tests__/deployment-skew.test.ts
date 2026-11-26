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

  it("recognizes a code chunk of the previous deployment that the new one no longer serves", () => {
    const webpack = Object.assign(
      new Error(
        "Loading chunk 8065 failed.\n(error: https://customermates.com/_next/static/chunks/8065-f4904e725ec685ec.js)",
      ),
      { name: "ChunkLoadError" },
    );
    const turbopack = Object.assign(new Error("Failed to load chunk /_next/static/chunks/a1.js from module 7"), {
      name: "ChunkLoadError",
    });
    const css = new Error("Loading CSS chunk 512 failed.\n(/_next/static/css/512.css)");
    expect(isDeploymentSkewError(webpack)).toBe(true);
    expect(isDeploymentSkewError(turbopack)).toBe(true);
    expect(isDeploymentSkewError(css)).toBe(true);
    expect(isDeploymentSkewError(new Error("Loading the record failed"))).toBe(false);
  });

  it("recognizes the previous deployment's webpack runtime requiring a module the new chunks do not define", () => {
    const runtime = "https://customermates.com/_next/static/chunks/webpack-9aa8008e3f7c251c.js";
    const page = "https://customermates.com/_next/static/chunks/app/settings/page-8315f6165089b5ba.js";
    const chrome = Object.assign(new TypeError("Cannot read properties of undefined (reading 'call')"), {
      stack: `TypeError: Cannot read properties of undefined (reading 'call')\n    at b (${runtime}:1:161)\n    at 9408 (${page}:1:443)`,
    });
    const safari = Object.assign(new TypeError("undefined is not an object (evaluating 'e[o].call')"), {
      stack: `b@${runtime}:1:161\n9408@${page}:1:443`,
    });
    const firefox = Object.assign(new TypeError("e[o] is undefined"), {
      stack: `b@${runtime}:1:161\n9408@${page}:1:443`,
    });
    expect(isDeploymentSkewError(chrome)).toBe(true);
    expect(isDeploymentSkewError(safari)).toBe(true);
    expect(isDeploymentSkewError(firefox)).toBe(true);

    const appCode = Object.assign(new TypeError("Cannot read properties of undefined (reading 'call')"), {
      stack: `TypeError: Cannot read properties of undefined (reading 'call')\n    at 9408 (${page}:1:443)\n    at b (${runtime}:1:161)`,
    });
    expect(isDeploymentSkewError(appCode)).toBe(false);
    expect(isDeploymentSkewError(new TypeError("Cannot read properties of undefined (reading 'call')"))).toBe(false);
  });
});
