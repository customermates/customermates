import { decodeGetParams } from "@/core/utils/get-params";

type SearchParams = Record<string, string | string[] | undefined>;

export async function readViewIdParam(searchParams: Promise<SearchParams> | SearchParams) {
  return decodeGetParams(await searchParams).viewId;
}
