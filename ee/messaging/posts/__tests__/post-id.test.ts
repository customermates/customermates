import { describe, expect, it } from "vitest";

import { unipilePostIdForFetch } from "../post-id";

const LIST_ID = "WyJhY3Rpdml0eTo3NDQ3MjYwMjQ1OTUwNjQ4MzIwIiwidWdjUG9zdDo3NDQ3MjYwMTgwOTM0Nzg3MDc0Il0=";

describe("unipilePostIdForFetch", () => {
  it("uses the fetchable half of a LinkedIn composite id", () => {
    expect(unipilePostIdForFetch(LIST_ID)).toBe("ugcPost:7447260180934787074");
  });

  it("leaves an id alone when the composite carries no fetchable half", () => {
    const activityOnly = Buffer.from(JSON.stringify(["activity:7447260245950648320"])).toString("base64");

    expect(unipilePostIdForFetch(activityOnly)).toBe(activityOnly);
  });

  it("passes a plain provider id through untouched", () => {
    expect(unipilePostIdForFetch("ugcPost:7447260180934787074")).toBe("ugcPost:7447260180934787074");
    expect(unipilePostIdForFetch("7447260180934787074")).toBe("7447260180934787074");
    expect(unipilePostIdForFetch("18012345678901234")).toBe("18012345678901234");
  });

  it("passes through anything that is not a base64 json array", () => {
    for (const value of ["", "not base64!", "eyJhIjoxfQ==", Buffer.from('"x"').toString("base64")])
      expect(unipilePostIdForFetch(value)).toBe(value);
  });
});
