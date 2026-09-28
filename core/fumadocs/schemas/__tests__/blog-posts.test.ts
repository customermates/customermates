import { describe, expect, it } from "vitest";

import { blogPostSchema } from "../blog-posts";

function blogPost(date: unknown) {
  return { author: "Author", backToBlog: "Back", by: "by", date, tags: [] };
}

describe("blogPostSchema", () => {
  it("accepts a calendar date written unquoted or quoted", () => {
    expect(blogPostSchema.parse(blogPost(new Date("2026-05-07"))).date).toEqual(new Date("2026-05-07"));
    expect(blogPostSchema.parse(blogPost("2024-02-29")).date).toBe("2024-02-29");
  });

  it.each(["2026-02-30", "2026-13-01", "May 7, 2026", "07.05.2026", ""])(
    "rejects %j so a mistyped publication date fails the build instead of dropping the post's dates",
    (date) => {
      expect(blogPostSchema.safeParse(blogPost(date)).success).toBe(false);
    },
  );
});
