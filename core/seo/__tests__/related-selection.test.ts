import { describe, expect, it } from "vitest";

import {
  RELATED_LINK_COUNT,
  RELATED_PAGE_LINK_COUNT,
  planRelatedLinks,
  ringOrder,
  selectRelatedSlugs,
} from "@/core/seo/related-selection";

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

describe("planRelatedLinks", () => {
  function plannedInbound(plan: Map<string, string[]>, pool: string[]): Map<string, number> {
    const counts = new Map(pool.map((slug) => [slug, 0]));
    for (const links of plan.values()) for (const slug of links) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    return counts;
  }

  it("keeps every curated link, in the order it was written", () => {
    const pool = slugs(10);
    const plan = planRelatedLinks(pool.map((slug) => ({ curated: [], slug })));
    const curated = ["post-007", "post-003"];
    const withCuration = planRelatedLinks(pool.map((slug) => ({ curated: slug === "post-001" ? curated : [], slug })));

    expect(withCuration.get("post-001")?.slice(0, 2)).toEqual(curated);
    expect(plan.get("post-001")).not.toEqual(withCuration.get("post-001"));
  });

  it("drops a curated slug that names no published page, or the page itself", () => {
    const pool = slugs(8);
    const plan = planRelatedLinks(
      pool.map((slug) => ({ curated: slug === "post-001" ? ["post-001", "ghost", "post-004"] : [], slug })),
    );

    expect(plan.get("post-001")).toContain("post-004");
    expect(plan.get("post-001")).not.toContain("post-001");
    expect(plan.get("post-001")).not.toContain("ghost");
  });

  it("gives every page a full, duplicate-free set of links", () => {
    const pool = slugs(12);
    const plan = planRelatedLinks(pool.map((slug) => ({ curated: [], slug })));

    for (const slug of pool) {
      const links = plan.get(slug) ?? [];
      expect(links, `${slug} outbound`).toHaveLength(RELATED_PAGE_LINK_COUNT);
      expect(new Set(links).size, `${slug} repeats a link`).toBe(links.length);
      expect(links, `${slug} links to itself`).not.toContain(slug);
    }
  });

  it("leaves no page without an inbound link, however lopsided the curation", () => {
    const pool = slugs(20);
    const hoarded = ["post-001", "post-002", "post-003"];
    const plan = planRelatedLinks(pool.map((slug) => ({ curated: hoarded.filter((s) => s !== slug), slug })));
    const inbound = plannedInbound(plan, pool);

    expect([...inbound].filter(([, count]) => count === 0).map(([slug]) => slug)).toEqual([]);
  });

  it("returns the same plan for the same input", () => {
    const entries = slugs(9).map((slug) => ({ curated: slug === "post-002" ? ["post-005"] : [], slug }));

    expect([...planRelatedLinks(entries)]).toEqual([...planRelatedLinks([...entries].reverse())]);
  });

  it("stops short rather than padding when the collection is tiny", () => {
    const plan = planRelatedLinks([
      { curated: [], slug: "a" },
      { curated: [], slug: "b" },
    ]);

    expect(plan.get("a")).toEqual(["b"]);
    expect(plan.get("b")).toEqual(["a"]);
  });
});
