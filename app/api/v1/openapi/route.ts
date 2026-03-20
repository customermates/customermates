import { NextResponse } from "next/server";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";

export function GET() {
  const spec = generateOpenApiSpec();
  return NextResponse.json(spec);
}
