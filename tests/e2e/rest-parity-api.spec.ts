import type { APIRequestContext } from "@playwright/test";

import { randomUUID } from "node:crypto";

import { request as playwrightRequest } from "@playwright/test";
import { z } from "zod";

import { presetId } from "../../features/records/crm-preset";
import { localE2eEnvironment } from "./local-environment";
import { expect, test } from "./fixtures";

type OpenApiDocument = {
  paths: Record<
    string,
    {
      post?: {
        responses: Record<
          string,
          { content?: Record<string, { schema: unknown }> }
        >;
      };
    }
  >;
  components: { schemas: Record<string, unknown> };
};

const localRefs = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value).replaceAll('"#/components/schemas/', '"#/$defs/'),
  ) as Record<string, unknown>;

function responseSchema(spec: OpenApiDocument, path: string, status: string) {
  const schema =
    spec.paths[path]?.post?.responses[status]?.content?.["application/json"]
      ?.schema;
  if (!schema)
    throw new Error(
      `The OpenAPI document has no ${status} response for POST ${path}`,
    );
  return z.fromJSONSchema({
    ...localRefs(schema),
    $defs: localRefs(spec.components.schemas),
  } as Parameters<typeof z.fromJSONSchema>[0]);
}

test("serves saved views, widgets, model discovery and Trash reads over an API key as the OpenAPI document declares", async ({
  context,
  companyId,
}) => {
  test.setTimeout(240000);
  const { baseUrl } = localE2eEnvironment();
  const keyResponse = await context.request.post(
    `${baseUrl}/api/auth/api-key/create`,
    {
      headers: { origin: baseUrl },
      data: { name: "Local REST parity verification", expiresIn: 86400 },
    },
  );
  expect(keyResponse.ok()).toBe(true);
  const credential = z
    .object({ key: z.string() })
    .parse(await keyResponse.json());
  const api: APIRequestContext = await playwrightRequest.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: { "x-api-key": credential.key },
  });
  const anonymous = await playwrightRequest.newContext({ baseURL: baseUrl });

  try {
    const specResponse = await api.get("/api/v1/openapi");
    expect(specResponse.status()).toBe(200);
    const spec = (await specResponse.json()) as OpenApiDocument;
    const checked = new Set<string>();

    const call = async (path: string, body: unknown, status = 200) => {
      const response = await api.post(`/api${path}`, { data: body });
      const payload: unknown = await response.json();
      expect(
        response.status(),
        `POST ${path}: ${JSON.stringify(payload)}`,
      ).toBe(status);
      const parsed = responseSchema(spec, path, String(status)).safeParse(
        payload,
      );
      expect(
        parsed.success,
        `POST ${path} response does not match its OpenAPI schema: ${parsed.error?.message}`,
      ).toBe(true);
      checked.add(`${path} ${status}`);
      return payload as any;
    };

    const unauthenticated = await anonymous.post(
      "/api/v1/data-views/surfaces",
      { data: {} },
    );
    expect(unauthenticated.status()).toBe(401);

    const dealTypeId = presetId(companyId, "deal");
    const discovered = await call("/v1/model/discover", {
      search: "deal",
      pageSize: 5,
    });
    expect(discovered.types.map((type: { id: string }) => type.id)).toContain(
      dealTypeId,
    );
    const model = await call("/v1/model/read", { typeIds: [dealTypeId] });
    expect(model.types.map((type: { id: string }) => type.id)).toEqual([
      dealTypeId,
    ]);
    expect(model.revision).toBe(discovered.schemaRevision);
    const revision = model.revision as number;

    const recordSurface = `records:${dealTypeId}`;
    const surfaces = await call("/v1/data-views/surfaces", {});
    expect(
      surfaces.items.map((item: { surfaceKey: string }) => item.surfaceKey),
    ).toEqual(expect.arrayContaining(["dashboard", recordSurface]));
    await call("/v1/data-views/config", {
      surfaceKey: recordSurface,
      section: "sorting",
    });
    const listView = await call("/v1/data-views/create", {
      surfaceKey: recordSurface,
      name: "API large deals",
      state: { pageSize: 25 },
    });
    await call("/v1/data-views/update", {
      surfaceKey: recordSurface,
      viewKey: listView.viewKey,
      state: { viewMode: "table" },
    });
    const readView = await call("/v1/data-views/read", {
      surfaceKey: recordSurface,
      viewKey: listView.viewKey,
    });
    expect(readView.items[0].state).toMatchObject({
      pageSize: 25,
      viewMode: "table",
    });
    await call("/v1/data-views/reset", {
      surfaceKey: recordSurface,
      viewKey: listView.viewKey,
      fields: ["pageSize"],
    });
    const dashboardView = await call("/v1/data-views/create", {
      surfaceKey: "dashboard",
      name: "API Berlin",
      state: {},
    });
    const views = await call("/v1/data-views/list", {
      surfaceKey: "dashboard",
    });
    expect(views.items.map((item: { id: string }) => item.id)).toContain(
      dashboardView.viewKey,
    );
    await call("/v1/data-views/select", {
      surfaceKey: "dashboard",
      viewKey: "__all__",
    });
    await call(
      "/v1/data-views/read",
      { surfaceKey: "dashboard", viewKey: randomUUID() },
      404,
    );

    const saved = await api.post("/api/v1/widgets/save", {
      data: {
        expectedRevision: revision,
        idempotencyKey: randomUUID(),
        name: "API Berlin count",
        isTemplate: false,
        measure: {
          source: { typeId: dealTypeId },
          aggregation: "count",
          valueFieldId: null,
          groupBy: null,
        },
        displayOptions: { displayType: "number" },
        viewId: dashboardView.viewKey,
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    const widgetId = ((await saved.json()) as { id: string }).id;
    const widgets = await call("/v1/widgets/list", {});
    expect(widgets.widgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: widgetId,
          viewId: dashboardView.viewKey,
        }),
      ]),
    );
    const widgetVersion = (
      (
        widgets as { widgets: Array<{ id: string; version: number }> }
      ).widgets.find((widget) => widget.id === widgetId) ?? { version: 0 }
    ).version;
    const placement = (columns: number) => [
      { i: widgetId, x: 0, y: 1, w: columns, h: 3 },
    ];
    const layouts = {
      xs: placement(2),
      sm: placement(4),
      md: placement(8),
      lg: [{ i: widgetId, x: 6, y: 1, w: 6, h: 3 }],
    };
    const moved = await call("/v1/widgets/layout", {
      layouts,
      expectedVersions: { [widgetId]: widgetVersion },
    });
    expect(moved).toEqual([
      expect.objectContaining({
        id: widgetId,
        layout: expect.objectContaining({
          lg: { i: widgetId, x: 6, y: 1, w: 6, h: 3 },
        }),
      }),
    ]);
    await call(
      "/v1/widgets/layout",
      {
        layouts: {
          xs: [],
          sm: [],
          md: [],
          lg: [{ i: widgetId, x: 8, y: 0, w: 6, h: 3 }],
        },
        expectedVersions: { [widgetId]: widgetVersion + 1 },
      },
      400,
    );
    await call(
      "/v1/widgets/layout",
      {
        layouts: { ...layouts, lg: [{ i: widgetId, x: 0, y: 1, w: 6, h: 3 }] },
        expectedVersions: { [widgetId]: widgetVersion },
      },
      409,
    );
    await call("/v1/widgets/delete", { id: widgetId });
    await call("/v1/widgets/delete", { id: widgetId }, 404);
    await call("/v1/data-views/delete", {
      surfaceKey: "dashboard",
      viewKey: dashboardView.viewKey,
    });

    const created = await api.post("/api/v1/records/mutate", {
      data: {
        expectedRevision: revision,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId: dealTypeId,
          fields: [
            {
              fieldId: presetId(companyId, "deal.name"),
              value: { kind: "text", value: "API trashed deal" },
            },
          ],
        },
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    const ref = (
      (await created.json()) as {
        refs: Array<{ typeId: string; recordId: string }>;
      }
    ).refs.find((candidate) => candidate.typeId === dealTypeId);
    if (!ref) throw new Error("The created deal reference is missing");
    await call("/v1/trash/read", ref, 404);
    const current = await api.post("/api/v1/records/read", { data: ref });
    const version = ((await current.json()) as { version: number }).version;
    const deleted = await api.post("/api/v1/records/mutate", {
      data: {
        expectedRevision: revision,
        idempotencyKey: randomUUID(),
        mutation: { action: "delete", ref, expectedVersion: version },
      },
    });
    expect(deleted.status(), await deleted.text()).toBe(200);
    const trashed = await call("/v1/trash/read", ref);
    expect(trashed.record.ref).toEqual(ref);
    expect(trashed.trash.canRestore).toBe(true);

    expect([...checked].sort()).toEqual(
      [
        "/v1/model/discover 200",
        "/v1/model/read 200",
        "/v1/data-views/surfaces 200",
        "/v1/data-views/config 200",
        "/v1/data-views/create 200",
        "/v1/data-views/update 200",
        "/v1/data-views/read 200",
        "/v1/data-views/read 404",
        "/v1/data-views/reset 200",
        "/v1/data-views/list 200",
        "/v1/data-views/select 200",
        "/v1/data-views/delete 200",
        "/v1/widgets/list 200",
        "/v1/widgets/layout 200",
        "/v1/widgets/layout 400",
        "/v1/widgets/layout 409",
        "/v1/widgets/delete 200",
        "/v1/widgets/delete 404",
        "/v1/trash/read 200",
        "/v1/trash/read 404",
      ].sort(),
    );
  } finally {
    await api.dispose();
    await anonymous.dispose();
  }
});
