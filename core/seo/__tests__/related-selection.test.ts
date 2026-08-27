import { describe, expect, it } from "vitest";

import { RELATED_LINK_COUNT, ringOrder, selectRelatedSlugs } from "@/core/seo/related-selection";

function slugs(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `post-${String(index + 1).padStart(3, "0")}`);
}

function inboundCounts(pool: string[], size = RELATED_LINK_COUNT): Map<string, number> {
  const counts = new Map(pool.map((slug) => [slug, 0]));
  for (const slug of pool)
    for (const related of selectRelatedSlugs(slug, pool, size)) counts.set(related, (counts.get(related) ?? 0) + 1);

  return counts;
}

describe("related selection", () => {
  it("gives every page the same number of outbound links", () => {
    const pool = slugs(143);
    for (const slug of pool)
      expect(selectRelatedSlugs(slug, pool), `${slug} outbound`).toHaveLength(RELATED_LINK_COUNT);
  });

  it("gives every page the same number of inbound links", () => {
    const pool = slugs(143);
    for (const [slug, count] of inboundCounts(pool))
      expect(count, `${slug} is linked from ${count} pages, not ${RELATED_LINK_COUNT}`).toBe(RELATED_LINK_COUNT);
  });

  it("leaves no page orphaned even at the smallest sizes", () => {
    for (const size of [2, 3, 4, 5, 8]) {
      const pool = slugs(size);
      const expected = Math.min(RELATED_LINK_COUNT, size - 1);
      for (const [slug, count] of inboundCounts(pool)) expect(count, `${slug} at pool size ${size}`).toBe(expected);
    }
  });

  it("never links a page to itself or twice to the same page", () => {
    const pool = slugs(20);
    for (const slug of pool) {
      const related = selectRelatedSlugs(slug, pool);
      expect(related, `${slug} links to itself`).not.toContain(slug);
      expect(new Set(related).size, `${slug} repeats a link`).toBe(related.length);
    }
  });

  it("connects the whole set into a single cycle", () => {
    const pool = slugs(143);
    const seen = new Set<string>();
    let current = pool[0];

    for (let step = 0; step < pool.length; step++) {
      expect(seen.has(current), `${current} revisited after ${step} steps, so the ring closed early`).toBe(false);
      seen.add(current);
      current = selectRelatedSlugs(current, pool)[0];
    }

    expect(seen.size, "the first related link must reach every page before returning").toBe(pool.length);
    expect(current, "the ring must close back on its start").toBe(pool[0]);
  });

  it("returns nothing for a pool that cannot support a link", () => {
    expect(selectRelatedSlugs("only", ["only"])).toEqual([]);
    expect(selectRelatedSlugs("absent", slugs(10))).toEqual([]);
    expect(selectRelatedSlugs("post-001", [])).toEqual([]);
  });

  it("ignores duplicates in the pool rather than emitting them", () => {
    const related = selectRelatedSlugs("a", ["a", "b", "b", "c", "a"]);
    expect(related).toEqual(["b", "c"]);
  });

  it("orders the ring by group so neighbours share a topic where one exists", () => {
    const items = [
      { group: "sales", slug: "z-sales" },
      { group: "ai", slug: "b-ai" },
      { group: "sales", slug: "a-sales" },
      { group: "ai", slug: "a-ai" },
    ];
    expect(
      ringOrder(
        items,
        (item) => item.group,
        (item) => item.slug,
      ).map((item) => item.slug),
    ).toEqual(["a-ai", "b-ai", "a-sales", "z-sales"]);
  });
});
