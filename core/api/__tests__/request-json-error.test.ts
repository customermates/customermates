import { describe, expect, it } from "vitest";

import type { InvalidJsonBodyError } from "@/core/errors/app-errors";
import { mapRequestJsonError } from "../request-json-error";

describe("mapRequestJsonError", () => {
  it.each(["", " \n\t", '{"truncated":'])("maps invalid request JSON to a client error", async (body) => {
    const request = new Request("http://localhost/api/v1/test", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });

    await expect(request.json().catch(mapRequestJsonError)).rejects.toEqual(
      expect.objectContaining<Partial<InvalidJsonBodyError>>({
        name: "InvalidJsonBodyError",
        message: "Invalid JSON body",
        statusCode: 400,
      }),
    );
  });

  it("does not reclassify non-parser failures", async () => {
    const error = new TypeError("body stream failed");

    await expect(Promise.reject(error).catch(mapRequestJsonError)).rejects.toBe(error);
  });
});
