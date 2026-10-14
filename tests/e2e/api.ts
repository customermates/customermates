import type { Page } from "@playwright/test";
import type { Client } from "pg";

import { expect } from "@playwright/test";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { assertPublishedResponse } from "../helpers/openapi-validator";

export async function postOk(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  if (path.startsWith("/api/v1/")) assertPublishedResponse(path.slice("/api".length), "post", 200, body);
  return body;
}

export async function readModel(database: Client, companyId: string) {
  const result = await database.query(
    'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  return RecordModelSchema.parse(result.rows[0]?.snapshot);
}
