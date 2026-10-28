import { randomUUID } from "node:crypto";

import { test, expect } from "./fixtures";
import { companyPath } from "./app-paths";
import { localE2eEnvironment } from "./local-environment";
import { sentEmailsTo } from "./transactional-mail";

test("a browser rejection reaches the local notification workflow with scrubbed, verified workspace context", async ({
  page,
  request,
  companyId,
  workspace,
  diagnostics,
}) => {
  const marker = `synthetic-rejection-${randomUUID()}`;
  const secret = "fixture-private-value";
  const path = companyPath(companyId, "/settings/profile");
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  diagnostics.expect({ kind: "pageerror", text: new RegExp(marker), page });
  const received = page.waitForRequest((incoming) => new URL(incoming.url()).pathname === "/api/observability/errors");
  await page.evaluate(({ marker, secret }) => { void Promise.reject(new Error(`${marker} token=${secret}`)); }, { marker, secret });
  const outgoing = (await received).postDataJSON();
  expect(outgoing.message).toContain(marker);
  expect(outgoing.message).not.toContain(secret);
  expect(outgoing).not.toHaveProperty("tenant");
  const notifications = () => sentEmailsTo("errors@customermates.test").filter((email) => email.text?.includes(`Event: ${outgoing.id}`));
  await expect.poll(notifications, { timeout: 90_000 }).toHaveLength(1);
  const notification = notifications()[0];
  expect(notification.text).toContain(workspace.userId);
  expect(notification.text).toContain(companyId);
  expect(notification.text).toContain(path);
  expect(notification.text).not.toContain(secret);

  const replay = await page.request.post("/api/observability/errors", {
    headers: { origin: localE2eEnvironment().baseUrl },
    data: outgoing,
  });
  expect(replay.status()).toBe(202);
  await expect.poll(() => notifications()[0]?.attempts, { timeout: 90_000 }).toBe(2);
  expect(notifications()).toHaveLength(1);
  expect(notifications()[0].id).toBe(notification.id);

  const anonymousId = randomUUID();
  const anonymous = await request.post("/api/observability/errors", {
    headers: { origin: localE2eEnvironment().baseUrl },
    data: { ...outgoing, id: anonymousId, tenant: { userId: workspace.userId, companyId } },
  });
  expect(anonymous.status()).toBe(202);
  expect(sentEmailsTo("errors@customermates.test").filter((email) => email.text?.includes(anonymousId))).toEqual([]);
});
