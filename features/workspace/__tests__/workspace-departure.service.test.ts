import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { Status } from "@/generated/prisma";

vi.mock("@/core/observability/server", () => ({ captureException: vi.fn() }));

import { extractAuditChanges } from "@/features/event/audit-changes";
import { APP_LOCALES } from "@/i18n/locale-registry";
import { WORKSPACE_DEPARTURE_FIELDS, WorkspaceDepartureService } from "../workspace-departure.service";

const AT = new Date("2026-11-17T09:30:00.000Z");

function announced(status: Status, kind: "left" | "removed") {
  const publish = vi.fn().mockResolvedValue(undefined);
  const unused = {} as never;
  const service = new WorkspaceDepartureService(
    unused,
    unused,
    { publish } as never,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
  );
  return service.announce({ id: "member-1", status }, kind, AT).then(() => publish.mock.calls);
}

describe("WorkspaceDepartureService.announce", () => {
  it("records that an inactive member left, although the status does not change", async () => {
    expect(await announced(Status.inactive, "left")).toEqual([
      [
        "user.updated",
        { entityId: "member-1", payload: { changes: { leftAt: { previous: null, current: AT.toISOString() } } } },
      ],
    ]);
  });

  it("records that an inactive member was removed, although the status does not change", async () => {
    expect(await announced(Status.inactive, "removed")).toEqual([
      [
        "user.updated",
        { entityId: "member-1", payload: { changes: { removedAt: { previous: null, current: AT.toISOString() } } } },
      ],
    ]);
  });

  it("names the departure before the status change of an active member, so it differs from a deactivation", async () => {
    const [[, data]] = await announced(Status.active, "left");

    expect(extractAuditChanges(data.payload)).toEqual([
      { field: "leftAt", previous: null, current: AT.toISOString() },
      { field: "status", previous: Status.active, current: Status.inactive },
    ]);
  });

  it("keeps a declined or withdrawn request a plain status change, because that person never was a member", async () => {
    for (const kind of ["left", "removed"] as const) {
      expect(await announced(Status.pendingAuthorization, kind)).toEqual([
        [
          "user.updated",
          {
            entityId: "member-1",
            payload: { changes: { status: { previous: Status.pendingAuthorization, current: Status.inactive } } },
          },
        ],
      ]);
    }
  });

  it.each(APP_LOCALES)("gives both departures a label the activity list can show in %s", (locale) => {
    const catalog = JSON.parse(readFileSync(join(process.cwd(), "i18n", "locales", `${locale}.json`), "utf8")) as {
      ActivityDetail: { fields: Record<string, string> };
      Common: { table: { columns: Record<string, string> } };
    };

    for (const field of Object.values(WORKSPACE_DEPARTURE_FIELDS)) {
      expect(catalog.Common.table.columns[field]).toBeUndefined();
      expect(catalog.ActivityDetail.fields[field]?.trim()).toBeTruthy();
    }
    expect(catalog.ActivityDetail.fields.leftAt).not.toBe(catalog.ActivityDetail.fields.removedAt);
  });
});
