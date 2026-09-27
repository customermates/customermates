import { NextResponse } from "next/server";

export const MALFORMED_REQUEST_PATH_MESSAGE = "Invalid percent-encoding in the request path";

function hasMalformedPercentEncoding(pathname: string): boolean {
  try {
    decodeURIComponent(pathname);
    return false;
  } catch {
    return true;
  }
}

export function malformedRequestPathResponse(pathname: string): NextResponse | null {
  if (!hasMalformedPercentEncoding(pathname)) return null;

  return NextResponse.json(MALFORMED_REQUEST_PATH_MESSAGE, { status: 400 });
}
