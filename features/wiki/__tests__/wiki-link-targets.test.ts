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

  it("reads a link to the list of a record type as a link without a record", () => {
    expect(parseRecordHref(`/records/${TYPE}`)).toEqual({ typeId: TYPE, recordId: null, slug: null });
    expect(parseRecordHref(`/records/${TYPE}/`)).toEqual({ typeId: TYPE, recordId: null, slug: null });
    expect(parseRecordHref(`${BASE_URL}/de/w/${SLUG}/records/${TYPE.toUpperCase()}?view=__all__`, BASE_URL)).toEqual({
      typeId: TYPE,
      recordId: null,
      slug: SLUG,
    });
  });

  it("rejects other origins, unknown locales, deeper paths and malformed ids", () => {
    expect(parseRecordHref(`https://elsewhere.example/records/${TYPE}/${RECORD}`, BASE_URL)).toBeNull();
    expect(parseRecordHref(`${BASE_URL}/records/${TYPE}/${RECORD}`)).toBeNull();
    expect(parseRecordHref("/records")).toBeNull();
    expect(parseRecordHref("/records/not-an-id")).toBeNull();
    expect(parseRecordHref(`/records/${TYPE}/${RECORD}/files`)).toBeNull();
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
    `The [customer list](/records/${TYPE}) and [the same list](${BASE_URL}/w/${SLUG}/records/${TYPE}?view=__all__).`,
    `Not a link: /wiki?page=${THIRD} and [docs](https://customermates.com/docs).`,
  ].join("\n\n");

  it("collects distinct page, record and list targets of the workspace, never the page itself", () => {
    expect(extractWikiLinkTargets(markdown, { baseUrl: BASE_URL, workspaceSlug: SLUG, pageId: PAGE })).toEqual({
      pages: [OTHER, THIRD],
      records: [{ typeId: TYPE, recordId: RECORD }],
      lists: [TYPE],
    });
  });

  it("keeps a list link apart from the links to single records of that list", () => {
    const onlyList = `[customers](/records/${TYPE})`;
    expect(extractWikiLinkTargets(onlyList, { baseUrl: BASE_URL, workspaceSlug: SLUG })).toEqual({
      pages: [],
      records: [],
      lists: [TYPE],
    });
  });

  it("counts a link to one section of a page as a link to that page", () => {
    const anchored = [
      `[a section](/wiki?page=${OTHER}#help-first)`,
      `[another](${BASE_URL}/w/${SLUG}/wiki?page=${THIRD}#steps)`,
      `[own section](/wiki?page=${PAGE}#here)`,
      `[foreign section](/w/beratung/wiki?page=${TYPE}#there)`,
    ].join(" ");
    expect(extractWikiLinkTargets(anchored, { baseUrl: BASE_URL, workspaceSlug: SLUG, pageId: PAGE })).toEqual({
      pages: [OTHER, THIRD],
      records: [],
      lists: [],
    });
  });

  it("keeps links of another workspace out", () => {
    const foreign = [
      `[page](/w/beratung/wiki?page=${OTHER})`,
      `[record](/w/beratung/records/${TYPE}/${RECORD})`,
      `[list](/w/beratung/records/${TYPE})`,
    ].join(" ");
    expect(extractWikiLinkTargets(foreign, { baseUrl: BASE_URL, workspaceSlug: SLUG })).toEqual({
      pages: [],
      records: [],
      lists: [],
    });
  });

  it("returns nothing for a page without links", () => {
    expect(extractWikiLinkTargets("# Title\n\nPlain text.", { baseUrl: BASE_URL, workspaceSlug: SLUG })).toEqual({
      pages: [],
      records: [],
      lists: [],
    });
  });
});
