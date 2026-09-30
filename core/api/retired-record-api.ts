import { NextResponse } from "next/server";

export const RETIRED_RECORD_API_REPLACEMENTS = {
  discover: "/api/v2/model/discover",
  read: "/api/v2/records/read",
  query: "/api/v2/records/query",
  mutate: "/api/v2/records/mutate",
} as const;

export function retiredRecordApiResponse() {
  return NextResponse.json(
    {
      code: "RECORD_API_V1_RETIRED",
      message:
        "This entity-specific CRM endpoint was retired. No operation was performed. Discover the current record type and its schema, then use the version 2 record API with both typeId and recordId. Update saved integrations before retrying.",
      contractVersion: 2,
      replacements: RETIRED_RECORD_API_REPLACEMENTS,
    },
    { status: 410, headers: { Link: '</docs/openapi>; rel="help"' } },
  );
}
