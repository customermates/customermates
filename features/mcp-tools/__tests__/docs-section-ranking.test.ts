import { describe, expect, it, vi } from "vitest";

import type { RankableSection, SectionRanker, SectionRanking } from "@/core/retrieval/retrieval-context";

import { docsDestinationFallbackOrder, stableDocsRanker } from "../docs-section-ranking";

const candidates: RankableSection[] = [
  { id: 0, locale: "en", section: { pageTitle: "Guide", headingPath: ["Create"], text: "Create the record." } },
  { id: 1, locale: "en", section: { pageTitle: "Guide", headingPath: ["Delete"], text: "Delete the record." } },
];
const context = { buildHash: "build-1", locale: "en" as const, source: "docs" as const };

function memo(ranker: SectionRanker) {
  const wrapped = stableDocsRanker({ ...context, ranker });
  if (!wrapped) throw new Error("Missing ranker");
  return wrapped;
}

describe("stable documentation selection", () => {
  it("reuses only an identical successful classification and protects the stored order", async () => {
    const ranker = vi
      .fn<SectionRanker>()
      .mockResolvedValueOnce({ order: [0, 1], abstained: false })
      .mockResolvedValue({ order: [1, 0], abstained: false });
    const first = await memo(ranker)("create record", candidates);
    first?.order.reverse();
    expect(await memo(ranker)("create record", candidates)).toEqual({ order: [0, 1], abstained: false });
    expect(ranker).toHaveBeenCalledOnce();
  });

  it.each<SectionRanking | null>([
    null,
    { order: [0], abstained: true },
    { order: [], abstained: false },
    { order: [99], abstained: false },
    { order: [0, 0], abstained: false },
  ])("never turns a missing, abstaining or invalid classification into a cached success", async (failure) => {
    const ranker = vi.fn<SectionRanker>().mockResolvedValue(failure);
    const wrapped = memo(ranker);
    expect(await wrapped("create record", candidates)).toEqual(failure);
    expect(await wrapped("create record", candidates)).toEqual(failure);
    expect(ranker).toHaveBeenCalledTimes(2);
  });

  it("does not retain a rejected request", async () => {
    const ranker = vi
      .fn<SectionRanker>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ order: [1], abstained: false });
    const wrapped = memo(ranker);
    await expect(wrapped("create record", candidates)).rejects.toThrow("network");
    expect(await wrapped("create record", candidates)).toEqual({ order: [1], abstained: false });
    expect(ranker).toHaveBeenCalledTimes(2);
  });

  it("isolates query, locale, source, build, candidate order and body changes", async () => {
    const ranker = vi.fn<SectionRanker>().mockResolvedValue({ order: [0], abstained: false });
    await memo(ranker)("create record", candidates);
    await memo(ranker)("delete record", candidates);
    await stableDocsRanker({ ...context, ranker, locale: "de" })?.("create record", candidates);
    await stableDocsRanker({ ...context, ranker, source: "all" })?.("create record", candidates);
    await stableDocsRanker({ ...context, ranker, buildHash: "build-2" })?.("create record", candidates);
    await memo(ranker)("create record", [...candidates].reverse());
    await memo(ranker)(
      "create record",
      candidates.map((candidate) => ({
        ...candidate,
        section: { ...candidate.section, text: `${candidate.section.text} Updated rule.` },
      })),
    );
    expect(ranker).toHaveBeenCalledTimes(7);
  });

  it("does not share a different user/message ranker identity", async () => {
    const first = vi.fn<SectionRanker>().mockResolvedValue({ order: [0], abstained: false });
    const second = vi.fn<SectionRanker>().mockResolvedValue({ order: [1], abstained: false });
    expect(await memo(first)("create record", candidates)).toEqual({ order: [0], abstained: false });
    expect(await memo(second)("create record", candidates)).toEqual({ order: [1], abstained: false });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("bounds the retained entries per ranker", async () => {
    const ranker = vi.fn<SectionRanker>().mockResolvedValue({ order: [0], abstained: false });
    const wrapped = memo(ranker);
    for (let index = 0; index < 65; index += 1) await wrapped(`query ${index}`, candidates);
    await wrapped("query 64", candidates);
    expect(ranker).toHaveBeenCalledTimes(65);
    await wrapped("query 0", candidates);
    expect(ranker).toHaveBeenCalledTimes(66);
  });

  it("uses the first completed successful classification during a concurrent miss", async () => {
    let resolveFirst: (value: SectionRanking) => void = () => {};
    let resolveSecond: (value: SectionRanking) => void = () => {};
    const ranker = vi
      .fn<SectionRanker>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const wrapped = memo(ranker);
    const first = wrapped("create record", candidates);
    const second = wrapped("create record", candidates);
    resolveFirst({ order: [0], abstained: false });
    expect(await first).toEqual({ order: [0], abstained: false });
    resolveSecond({ order: [1], abstained: false });
    expect(await second).toEqual({ order: [0], abstained: false });
  });
});

describe("documentation destination fallback", () => {
  const section = (id: number, text: string): RankableSection => ({
    id,
    locale: "en",
    section: { pageTitle: "Guide", headingPath: ["Section"], text },
  });

  it("requires every meaningful query term in the source-owned destination and keeps both orders stable", () => {
    const choices = [
      section(4, "Tasks page link in the body.\n**Link:** the Members page, `/company/members`."),
      section(7, "**Link:** the link to the Tasks page, `/tasks`."),
      section(2, "**Link:** the link to the Tasks page, `/tasks`."),
      section(9, "**Link:** the Projects page, `/projects`."),
    ];
    expect(docsDestinationFallbackOrder("link to the tasks page", choices)).toEqual([7, 2, 4, 9]);
    expect(docsDestinationFallbackOrder("how do I create tasks", choices)).toBeNull();
    expect(docsDestinationFallbackOrder("unavailable destination", choices)).toBeNull();
    expect(choices.map(({ id }) => id)).toEqual([4, 7, 2, 9]);
  });

  it("does not credit metadata labels, route names, body mentions or Mate instructions as destinations", () => {
    expect(
      docsDestinationFallbackOrder("link to the tasks page", [
        section(0, "**Link:** `/tasks`. **Mate:** link to the tasks page"),
        section(1, "The link to the Tasks page is here.\n**Link:** `/company/members`."),
        section(2, "**Link:** the Tasks page, `/tasks`."),
      ]),
    ).toBeNull();
  });
});
