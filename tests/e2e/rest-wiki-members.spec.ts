import { randomUUID } from "node:crypto";
import type { APIResponse } from "@playwright/test";
import { z } from "zod";
import { localE2eEnvironment } from "./local-environment";
import { test, expect } from "./fixtures";
import { createOpenApiValidator, type OpenApiDocument } from "../helpers/openapi-validator";

function responseValidator(spec: OpenApiDocument) {
  const validator = createOpenApiValidator(spec);
  return async (response: APIResponse, path: string, verb: string, status: number) => {
    const body: unknown = await response.json();
    expect(response.status(), `${verb} ${path}: ${JSON.stringify(body)}`).toBe(status);
    expect(validator.response(path, verb, status, body), `${verb} ${path} ${status} response`).toEqual([]);
    return body as Record<string, unknown>;
  };
}

const Page = z.object({
  id: z.uuid(),
  title: z.string(),
  updatedAt: z.string(),
});

test("serves the Knowledge Base, member and profile REST endpoints to an API key as documented", async ({
  context,
  playwright,
  database,
  workspace,
}) => {
  const { baseUrl } = localE2eEnvironment();
  const keyResponse = await context.request.post(
    `${baseUrl}/api/auth/api-key/create`,
    {
      headers: { origin: baseUrl },
      data: { name: "Local REST parity verification", expiresIn: 86400 },
    },
  );
  expect(keyResponse.ok()).toBe(true);
  const { key } = z.object({ key: z.string() }).parse(await keyResponse.json());
  const api = await playwright.request.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: { "x-api-key": key },
  });
  const anonymous = await playwright.request.newContext({ baseURL: baseUrl });
  try {
    const specResponse = await api.get("/api/v1/openapi");
    expect(specResponse.ok()).toBe(true);
    const validate = responseValidator((await specResponse.json()) as OpenApiDocument);
    const post = async (path: string, data: unknown, status = 200) =>
      validate(await api.post(`/api${path}`, { data }), path, "post", status);

    await validate(
      await anonymous.post("/api/v1/wiki/list", { data: {} }),
      "/v1/wiki/list",
      "post",
      401,
    );

    const created = z.array(Page).parse(
      await post("/v1/wiki/create", {
        pages: [
          {
            title: "REST parity voice",
            markdown: "Write plainly. rest-parity-e2e-phrase",
          },
          {
            title: "REST parity escalation",
            kind: "procedure",
            whenToUse: "A customer reports an outage.",
            markdown: "1. Confirm the account.\n2. Call the support lead.",
          },
        ],
      }),
    );
    const [voice, escalation] = created;

    const listed = await post("/v1/wiki/list", { pageSize: 25 });
    expect(
      z
        .array(Page)
        .parse(listed.items)
        .map(({ id }) => id),
    ).toEqual([voice.id, escalation.id]);

    const searched = await post("/v1/wiki/search", {
      query: "rest parity e2e phrase",
    });
    expect(searched.items).toContainEqual(
      expect.objectContaining({ id: voice.id }),
    );

    const read = Page.parse(await post("/v1/wiki/read", { id: voice.id }));
    const updated = Page.parse(
      await post("/v1/wiki/update", {
        id: voice.id,
        expectedUpdatedAt: read.updatedAt,
        title: "REST parity tone",
      }),
    );
    expect(updated.title).toBe("REST parity tone");
    await post(
      "/v1/wiki/update",
      { id: voice.id, expectedUpdatedAt: read.updatedAt, title: "Stale" },
      409,
    );

    expect(
      await post("/v1/wiki/move", {
        id: escalation.id,
        targetId: voice.id,
        placement: "before",
      }),
    ).toBe(true);
    const reordered = await post("/v1/wiki/list", { pageSize: 25 });
    expect(
      z
        .array(Page)
        .parse(reordered.items)
        .map(({ id }) => id),
    ).toEqual([escalation.id, voice.id]);

    const deleted = await post("/v1/wiki/delete", {
      id: voice.id,
      expectedUpdatedAt: updated.updatedAt,
    });
    expect(deleted).toMatchObject({
      id: voice.id,
      trashBatchId: expect.any(String),
    });
    await post("/v1/wiki/read", { id: voice.id }, 404);

    const memberId = randomUUID();
    const memberEmail = `rest-member-${memberId}@example.test`;
    const role = await database.query<{ roleId: string }>(
      'SELECT "roleId" FROM "User" WHERE id=$1',
      [workspace.userId],
    );
    await database.query(
      'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,country,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","updatedAt") VALUES ($1,$2,$3,$4,\'Rest\',\'Member\',\'active\',\'de\',true,NOW(),\'en\',\'en\',NOW())',
      [memberId, workspace.companyId, role.rows[0].roleId, memberEmail],
    );
    const member = {
      email: memberEmail,
      firstName: "Rest",
      lastName: "Member",
      country: "de",
      avatarUrl: null,
      roleId: role.rows[0].roleId,
    };
    expect(
      await post("/v1/members/update", { ...member, status: "inactive" }),
    ).toMatchObject({ status: "inactive" });
    const stored = await database.query(
      'SELECT status FROM "User" WHERE id=$1',
      [memberId],
    );
    expect(stored.rows).toEqual([{ status: "inactive" }]);
    await post(
      "/v1/members/update",
      {
        ...member,
        email: `missing-${memberId}@example.test`,
        status: "active",
      },
      404,
    );

    // A valid invitation sends real email in a production build, so the browser run proves only the
    // documented refusal; the database suite covers delivery through a stubbed mailer.
    await post("/v1/members/invite", { emails: ["not-an-address"] }, 400);

    const profile = await validate(
      await api.patch("/api/v1/users/me", {
        data: { lastName: "Admin", theme: "dark", formattingLocale: "de" },
      }),
      "/v1/users/me",
      "patch",
      200,
    );
    expect(profile).toMatchObject({
      firstName: "Browser",
      lastName: "Admin",
      theme: "dark",
      formattingLocale: "de",
    });
    const me = await validate(
      await api.get("/api/v1/users/me"),
      "/v1/users/me",
      "get",
      200,
    );
    expect(me).toMatchObject({
      id: workspace.userId,
      lastName: "Admin",
      theme: "dark",
    });
    await validate(
      await api.patch("/api/v1/users/me", { data: { country: "atlantis" } }),
      "/v1/users/me",
      "patch",
      400,
    );
  } finally {
    await api.dispose();
    await anonymous.dispose();
  }
});
