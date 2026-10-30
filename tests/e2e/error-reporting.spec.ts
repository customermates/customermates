import { randomUUID } from "node:crypto";

import { test, expect } from "./fixtures";
import { companyPath } from "./app-paths";

test("a browser rejection reaches the error endpoint scrubbed and without client-supplied tenant", async ({
  page,
  companyId,
  diagnostics,
}) => {
  const marker = `synthetic-rejection-${randomUUID().replace(/-/g, "").replace(/\d/g, (digit) => "ghijklmnop"[Number(digit)])}`;
  const secret = "fixture-private-value";
  await page.goto(companyPath(companyId, "/settings/profile"));
  await page.waitForLoadState("networkidle");
  diagnostics.expect({ kind: "pageerror", text: new RegExp(marker), page });
  const received = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/observability/errors");
  await page.evaluate(({ marker, secret }) => { void Promise.reject(new Error(`${marker} token=${secret}`)); }, { marker, secret });
  const response = await received;
  expect(response.status()).toBe(202);
  const outgoing = response.request().postDataJSON();
  expect(outgoing.message).toContain(marker);
  expect(outgoing.message).not.toContain(secret);
  expect(outgoing).not.toHaveProperty("tenant");
});
