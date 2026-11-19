import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PostCardDate } from "../post-card-date";

const SERVER_DATE = String(new Date("2026-11-04T00:00:00.000Z"));
const initialTimeZone = process.env.TZ;

function renderIn(timeZone: string) {
  process.env.TZ = timeZone;
  return renderToStaticMarkup(<PostCardDate date={SERVER_DATE} locale="en" />);
}

afterEach(() => {
  if (initialTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = initialTimeZone;
});

describe("blog card date", () => {
  it("shows the publication day the server rendered, whatever the visitor's time zone", () => {
    const server = renderIn("UTC");

    expect(server).toContain("November 4, 2026");
    expect(renderIn("America/Los_Angeles")).toBe(server);
    expect(renderIn("Pacific/Auckland")).toBe(server);
  });
});
