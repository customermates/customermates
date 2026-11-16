import { describe, expect, it } from "vitest";

import { extractWikiLinkTargets, parseRecordHref } from "../wiki-link-targets";

const PAGE = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const THIRD = "10000000-0000-4000-8000-000000000003";
const TYPE = "20000000-0000-4000-8000-000000000001";
const RECORD = "30000000-0000-4000-8000-000000000001";
const BASE_URL = "https://app.customermates.com";
const SLUG = "acme";

describe("record link parsing", () => {
  it("reads relative, locale and workspace qualified record paths", () => {
    expect(parseRecordHref(`/records/${TYPE}/${RECORD}`)).toEqual({ typeId: TYPE, recordId: RECORD, slug: null });
    expect(parseRecordHref(`/de/w/${SLUG}/records/${TYPE}/${RECORD}?view=__all__`)).toEqual({
      typeId: TYPE,
      recordId: RECORD,
      slug: SLUG,
    });
    expect(parseRecordHref(`${BASE_URL}/en/records/${TYPE.toUpperCase()}/${RECORD}#notes`, BASE_URL)).toEqual({
      typeId: TYPE,
      recordId: RECORD,
      slug: null,
    });
  });

  it("rejects other origins, list pages, unknown locales and malformed ids", () => {
    expect(parseRecordHref(`https://elsewhere.example/records/${TYPE}/${RECORD}`, BASE_URL)).toBeNull();
    expect(parseRecordHref(`${BASE_URL}/records/${TYPE}/${RECORD}`)).toBeNull();
    expect(parseRecordHref(`/records/${TYPE}`)).toBeNull();
    expect(parseRecordHref(`/xx/records/${TYPE}/${RECORD}`)).toBeNull();
    expect(parseRecordHref(`/records/${TYPE}/not-an-id`)).toBeNull();
    expect(parseRecordHref(`//records/${TYPE}/${RECORD}`)).toBeNull();
    expect(parseRecordHref(`/w/Not_A_Slug/records/${TYPE}/${RECORD}`)).toBeNull();
  });
});

describe("link targets of a page", () => {
  const markdown = [
    `See [the other page](/wiki?page=${OTHER}) and [again](${BASE_URL}/w/${SLUG}/wiki?page=${OTHER}).`,
    `A [third](/de/wiki?page=${THIRD}) page, [myself](/wiki?page=${PAGE}) and [elsewhere](/w/beratung/wiki?page=${THIRD}).`,
    `Customer [Acme](/records/${TYPE}/${RECORD}) and [again](${BASE_URL}/w/${SLUG}/records/${TYPE}/${RECORD}).`,
    `Not a link: /wiki?page=${THIRD} and [docs](https://customermates.com/docs).`,
  ].join("\n\n");

  it("collects distinct page and record targets of the workspace, never the page itself", () => {
    expect(extractWikiLinkTargets(markdown, { baseUrl: BASE_URL, workspaceSlug: SLUG, pageId: PAGE })).toEqual({
      pages: [OTHER, THIRD],
      records: [{ typeId: TYPE, recordId: RECORD }],
    });
  });

  it("keeps links of another workspace out", () => {
    const foreign = `[page](/w/beratung/wiki?page=${OTHER}) [record](/w/beratung/records/${TYPE}/${RECORD})`;
    expect(extractWikiLinkTargets(foreign, { baseUrl: BASE_URL, workspaceSlug: SLUG })).toEqual({
      pages: [],
      records: [],
    });
  });

  it("returns nothing for a page without links", () => {
    expect(extractWikiLinkTargets("# Title\n\nPlain text.", { baseUrl: BASE_URL, workspaceSlug: SLUG })).toEqual({
      pages: [],
      records: [],
    });
  });
});
