import { PermissionService } from "@/core/base/permission.service";
import type { Filter } from "@/core/base/base-get.schema";

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { startOfDay, subDays } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { createMockUser } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { emailFolderFilterValue } from "../../inbox/messaging-filter-options.schema";
import { PrismaConnectedAccountRepo } from "../prisma-connected-account.repository";
import { PrismaMessagingRepo } from "../prisma-messaging.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("inbox filters on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const userId = randomUUID();
  const peerId = randomUUID();
  const foreignUserId = randomUUID();
  const account = Object.fromEntries(
    [
      "a",
      "b",
      "shared",
      "individual",
      "private",
      "foreign",
      "chat",
      "deleted",
      "calendar",
      "individual-hidden",
      "individual-unselected",
    ].map((key) => [key, randomUUID()]),
  );
  const threads: Record<string, string> = {};
  const tieMessageIds = [randomUUID(), randomUUID()].sort();
  const tenant = createMockUser({ id: userId, companyId });
  const currentDate = new Date();
  const recent = new Date(currentDate.getTime() - 60_000);
  const earlier = new Date(currentDate.getTime() - 120_000);
  const old = new Date(currentDate.getTime() - 40 * 86400_000);
  const catalog = ["inbox", "sent", "archive", "private-folder", "unselected"].map((id) => ({
    id,
    name: id === "inbox" ? "Inbox" : id,
    role: null,
    totalCount: null,
    unreadCount: null,
  }));

  type Message = {
    direction: "inbound" | "outbound";
    folders?: string[];
    at?: Date;
    draft?: boolean;
    hidden?: boolean;
    deleted?: boolean;
    event?: boolean;
    id?: string;
  };

  async function thread(name: string, accountKey: string, messages: Message[], shared = false) {
    const id = randomUUID();
    threads[name] = id;
    const company = accountKey === "foreign" ? foreignCompanyId : companyId;
    const provider = accountKey === "chat" ? "whatsapp" : "mail";
    const latest = messages.reduce<Date | null>(
      (at, message) => (!at || (message.at ?? recent) > at ? (message.at ?? recent) : at),
      null,
    );
    await client.query(
      `INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId",provider,type,"unipileThreadId",state,
        "sharedToCrm","lastMessageAt","lastMessageIsSender","subject","updatedAt")
        VALUES ($1,$2,$3,$4,'single',$1,'open',$5,$6,$7,$8,NOW())`,
      [
        id,
        company,
        account[accountKey],
        provider,
        shared,
        latest?.toISOString() ?? null,
        messages.at(-1)?.direction === "outbound",
        name,
      ],
    );
    for (const message of messages) {
      const messageId = message.id ?? randomUUID();
      await client.query(
        `INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",
          provider,direction,origin,sender,recipients,"folderIds","isDraft","isHidden","isDeleted","isEvent","sentAt","updatedAt")
          VALUES ($1,$2,$3,$4,$1,$5,$6,'external','{}','{}',$7,$8,$9,$10,$11,$12,NOW())`,
        [
          messageId,
          company,
          id,
          account[accountKey],
          provider,
          message.direction,
          message.folders ?? ["inbox"],
          message.draft ?? false,
          message.hidden ?? false,
          message.deleted ?? false,
          message.event ?? false,
          (message.at ?? recent).toISOString(),
        ],
      );
    }
  }

  beforeAll(async () => {
    await client.connect();
    for (const id of [companyId, foreignCompanyId]) {
      await client.query('INSERT INTO "Company" (id,"updatedAt") VALUES ($1,NOW())', [id]);
      await client.query(
        'INSERT INTO "UserRole" (id,name,"isSystemRole","companyId","updatedAt") VALUES ($1,\'Admin\',TRUE,$1,NOW())',
        [id],
      );
    }

    for (const [id, company] of [
      [userId, companyId],
      [peerId, companyId],
      [foreignUserId, foreignCompanyId],
    ]) {
      await client.query(
        'INSERT INTO "User" (id,email,"firstName","lastName","companyId","roleId",status,"updatedAt") VALUES ($1,$2,\'Filter\',\'Fixture\',$3,$3,\'active\',NOW())',
        [id, `${id}@example.invalid`, company],
      );
    }

    for (const [key, id] of Object.entries(account)) {
      const owner =
        key === "foreign"
          ? foreignUserId
          : ["shared", "individual", "private", "individual-hidden", "individual-unselected"].includes(key)
            ? peerId
            : userId;
      await client.query(
        `INSERT INTO "ConnectedAccount" (id,"companyId","userId",provider,"unipileAccountId",status,shared,"hasMessaging",
          "displayName","emailAddress",folders,"selectedFolderIds","foldersSyncedAt","updatedAt")
          VALUES ($1,$2,$3,$4,$1,$5,$6,$7,$8,$9,$10,ARRAY['inbox','sent','archive','private-folder'],$11,NOW())`,
        [
          id,
          key === "foreign" ? foreignCompanyId : companyId,
          owner,
          key === "chat" ? "whatsapp" : "mail",
          key === "deleted" ? "deleted" : "ok",
          key === "shared",
          key !== "calendar",
          `Account ${key}`,
          `${key}@example.invalid`,
          JSON.stringify(catalog),
          key === "chat" ? null : currentDate.toISOString(),
        ],
      );
    }
    await thread("received", "a", [{ direction: "inbound" }]);
    await thread("sent", "a", [
      { direction: "inbound", at: earlier },
      { direction: "outbound", folders: ["sent"] },
    ]);
    for (const ignored of ["draft", "hidden", "deleted", "event"] as const) {
      await thread(`${ignored}-after-received`, "a", [
        { direction: "inbound", at: earlier },
        { direction: "outbound", [ignored]: true },
      ]);
    }

    await thread("unselected-after-received", "a", [
      { direction: "inbound", at: earlier },
      { direction: "outbound", folders: ["unselected"] },
    ]);
    await thread("multiple-placements", "a", [{ direction: "inbound", folders: ["inbox", "sent"] }]);
    await thread("account-b", "b", [{ direction: "outbound" }]);
    await thread("old-archive", "a", [{ direction: "inbound", folders: ["archive"], at: old }]);
    await thread("no-folder", "a", [{ direction: "inbound", folders: [] }]);
    await thread("draft-only", "a", [{ direction: "outbound", draft: true }]);
    await thread("shared-account", "shared", [{ direction: "outbound" }]);
    await thread("individual-share", "individual", [{ direction: "inbound" }], true);
    await thread("individual-private", "individual", [{ direction: "outbound", folders: ["private-folder"] }]);
    await thread("private-account", "private", [{ direction: "outbound" }]);
    await thread("hidden-individual-share", "individual-hidden", [{ direction: "inbound", hidden: true }], true);
    await thread(
      "unselected-individual-share",
      "individual-unselected",
      [{ direction: "inbound", folders: ["unselected"] }],
      true,
    );
    await thread("foreign", "foreign", [{ direction: "outbound" }]);
    await thread("chat", "chat", [{ direction: "inbound", folders: [] }]);
    await thread("hidden-only", "a", [{ direction: "outbound", hidden: true }]);
    await thread("unselected-only", "a", [{ direction: "outbound", folders: ["unselected"] }]);
    await thread("empty", "a", []);
    await thread("tie", "a", [
      { direction: "inbound", id: tieMessageIds[0] },
      { direction: "outbound", id: tieMessageIds[1] },
    ]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE id=ANY($1::text[])', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  const filter = (field: FilterFieldKey, values: string[], exclude = false): Filter => ({
    field,
    operator: exclude ? FilterOperatorKey.notIn : FilterOperatorKey.in,
    value: values,
  });
  const folder = (key: string, id = "inbox") => emailFolderFilterValue(account[key], id);
  const received = [
    "received",
    "draft-after-received",
    "hidden-after-received",
    "deleted-after-received",
    "event-after-received",
    "unselected-after-received",
    "multiple-placements",
    "old-archive",
    "no-folder",
    "individual-share",
    "chat",
  ];
  const sent = ["sent", "account-b", "shared-account", "tie"];
  const visible = [...received, ...sent, "draft-only"];
  const aInbox = [
    "received",
    "sent",
    "draft-after-received",
    "hidden-after-received",
    "deleted-after-received",
    "event-after-received",
    "unselected-after-received",
    "multiple-placements",
    "draft-only",
    "tie",
  ];
  const ids = (names: string[]) => names.map((name) => threads[name]).sort();
  const query = (filters: Filter[], user = tenant) =>
    runWithTenant(user, async () => {
      const repo = new PrismaMessagingRepo();
      const [items, total] = await Promise.all([repo.getItems({ filters }), repo.getCount({ filters })]);
      expect(total).toBe(items.length);
      return items.map((item) => item.id).sort();
    });

  it.each([
    ["received", [filter(FilterFieldKey.lastMessageDirection, ["inbound"])], received],
    ["sent", [filter(FilterFieldKey.lastMessageDirection, ["outbound"])], sent],
    ["not sent", [filter(FilterFieldKey.lastMessageDirection, ["outbound"], true)], received],
    ["not received", [filter(FilterFieldKey.lastMessageDirection, ["inbound"], true)], sent],
    [
      "either direction",
      [filter(FilterFieldKey.lastMessageDirection, ["inbound", "outbound"])],
      [...received, ...sent],
    ],
    ["neither direction", [filter(FilterFieldKey.lastMessageDirection, ["inbound", "outbound"], true)], []],
    ["account-qualified folder", [filter(FilterFieldKey.emailFolder, [folder("a")])], aInbox],
    ["other account's same folder ID", [filter(FilterFieldKey.emailFolder, [folder("b")])], ["account-b"]],
    [
      "any selected folder",
      [filter(FilterFieldKey.emailFolder, [folder("a", "sent"), folder("b")])],
      ["sent", "multiple-placements", "account-b"],
    ],
    [
      "none of selected folders",
      [filter(FilterFieldKey.emailFolder, [folder("a")], true)],
      visible.filter((name) => !aInbox.includes(name)),
    ],
    [
      "folder and direction",
      [filter(FilterFieldKey.emailFolder, [folder("a")]), filter(FilterFieldKey.lastMessageDirection, ["outbound"])],
      ["sent", "tie"],
    ],
    ["specific connected account", [filter(FilterFieldKey.connectedAccountId, [account.b])], ["account-b"]],
    [
      "individual shared account",
      [filter(FilterFieldKey.connectedAccountId, [account.individual])],
      ["individual-share"],
    ],
    ["foreign folder", [filter(FilterFieldKey.emailFolder, [folder("foreign")])], []],
    ["private account", [filter(FilterFieldKey.connectedAccountId, [account.private])], []],
    ["invalid folder", [filter(FilterFieldKey.emailFolder, ["malformed"])], []],
    ["invalid negative folder", [filter(FilterFieldKey.emailFolder, ["malformed"], true)], []],
    ["invalid direction", [filter(FilterFieldKey.lastMessageDirection, ["unknown"])], []],
    [
      "recent activity",
      [
        {
          field: FilterFieldKey.lastMessageAt,
          operator: FilterOperatorKey.inLastDays,
          value: 7,
        },
      ],
      visible.filter((name) => name !== "old-archive"),
    ],
    [
      "old activity",
      [
        {
          field: FilterFieldKey.lastMessageAt,
          operator: FilterOperatorKey.lt,
          value: new Date(currentDate.getTime() - 30 * 86400_000).toISOString(),
        },
      ],
      ["old-archive"],
    ],
  ] as [string, Filter[], string[]][])("matches %s and keeps count consistent", async (_, filters, expected) => {
    expect(await query(filters)).toEqual(ids(expected));
  });

  it("keeps pagination and total aligned under the last-message predicate", async () => {
    await runWithTenant(tenant, async () => {
      const repo = new PrismaMessagingRepo();
      const filters = [filter(FilterFieldKey.lastMessageDirection, ["inbound"])];
      const first = await repo.getItems({ filters, take: 5, skip: 0 });
      const second = await repo.getItems({ filters, take: 5, skip: 5 });
      expect(first).toHaveLength(5);
      expect(second).toHaveLength(5);
      expect(new Set([...first, ...second].map((item) => item.id)).size).toBe(10);
      expect(await repo.getCount({ filters })).toBe(received.length);
    });
  });

  it("scopes options to caller access and only exposes placements of individually shared threads", async () => {
    const options = await runWithTenant(tenant, () =>
      new PrismaConnectedAccountRepo(new PermissionService()).listInboxFilterOptions(),
    );
    expect(options.accounts.map((option) => option.value).sort()).toEqual(
      [account.a, account.b, account.shared, account.individual, account.chat].sort(),
    );
    expect(options.folders.some((option) => option.value === folder("a"))).toBe(true);
    expect(options.folders.some((option) => option.value === folder("b"))).toBe(true);
    expect(
      options.folders.filter((option) => option.value.includes(account.individual)).map((option) => option.value),
    ).toEqual([folder("individual")]);
    expect(options.folders.some((option) => option.value === folder("a", "unselected"))).toBe(false);
    expect(
      options.folders
        .filter((option) => option.groupKey === account.a)
        .every((option) => option.groupLabel === "Account a · a@example.invalid"),
    ).toBe(true);
    expect(
      options.folders.filter((option) => option.groupKey === account.b).some((option) => option.label === "Inbox"),
    ).toBe(true);
    expect(options.accounts.some((option) => option.value === account["individual-hidden"])).toBe(false);
    expect(options.accounts.some((option) => option.value === account["individual-unselected"])).toBe(false);
    expect(
      options.folders.some((option) =>
        [account["individual-hidden"], account["individual-unselected"]].some((id) => id === option.groupKey),
      ),
    ).toBe(false);
    const fields = await runWithTenant(tenant, () => new PrismaMessagingRepo().getFilterableFields());
    expect(fields.find((field) => field.field === FilterFieldKey.emailFolder)?.options).toEqual(options.folders);
    expect(fields.find((field) => field.field === FilterFieldKey.connectedAccountId)?.options).toEqual(
      options.accounts,
    );
  });

  it("recomputes access for a different user and workspace", async () => {
    const peer = createMockUser({ id: peerId, companyId });
    expect(await query([filter(FilterFieldKey.lastMessageDirection, ["outbound"])], peer)).toEqual(
      ids(["shared-account", "individual-private", "private-account"]),
    );
    const foreign = createMockUser({
      id: foreignUserId,
      companyId: foreignCompanyId,
    });
    expect(await query([filter(FilterFieldKey.lastMessageDirection, ["outbound"])], foreign)).toEqual(ids(["foreign"]));
    const options = await runWithTenant(foreign, () =>
      new PrismaConnectedAccountRepo(new PermissionService()).listInboxFilterOptions(),
    );
    expect(options.accounts.map((option) => option.value)).toEqual([account.foreign]);
    expect(options.folders.map((option) => option.value)).toContain(folder("foreign"));
    expect(options.folders.some((option) => option.value.includes(account.a))).toBe(false);
  });

  it("preserves ascending activity order and its identifier tie-break under direction filtering", async () => {
    await runWithTenant(tenant, async () => {
      const repo = new PrismaMessagingRepo();
      const params = {
        filters: [filter(FilterFieldKey.lastMessageDirection, ["inbound"])],
        take: 100,
        sortDescriptor: { field: "lastMessageAt", direction: "asc" as const },
      };
      const rows = await repo.getItems(params);
      expect(rows[0].id).toBe(threads["old-archive"]);
      const times = rows.map((row) => row.lastMessageAt?.getTime() ?? Number.POSITIVE_INFINITY);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      for (let index = 1; index < rows.length; index++)
        if (times[index] === times[index - 1]) expect(rows[index].id > rows[index - 1].id).toBe(true);
    });
  });

  describe("last actual message date", () => {
    const atFiveDays = subDays(currentDate, 5);
    const atThreeDays = startOfDay(subDays(currentDate, 3));
    const atSevenDays = startOfDay(subDays(currentDate, 7));
    const names: string[] = [];
    const dateFilter = (operator: FilterOperatorKey, value: string | string[] | number) =>
      ({ field: FilterFieldKey.lastMessageSentAt, operator, value }) as Filter;
    const range = [dateFilter(FilterOperatorKey.notInLastDays, 3), dateFilter(FilterOperatorKey.inLastDays, 7)];
    const dateQuery = (filters: Filter[], user = tenant) =>
      runWithTenant(user, async () => {
        const repo = new PrismaMessagingRepo();
        const params = { searchTerm: "last-date-", filters, take: 100 };
        const [items, total] = await Promise.all([repo.getItems(params), repo.getCount(params)]);
        expect(total).toBe(items.length);
        return items.map(({ id }) => id).sort();
      });

    beforeAll(async () => {
      const add = async (suffix: string, accountKey: string, messages: Message[], shared = false) => {
        const name = `last-date-${suffix}`;
        names.push(name);
        await thread(name, accountKey, messages, shared);
      };
      await add("two", "a", [{ direction: "inbound", at: subDays(currentDate, 2) }]);
      await add("five", "a", [{ direction: "inbound", at: atFiveDays }]);
      await add("sent-five", "a", [{ direction: "outbound", at: atFiveDays, folders: ["sent"] }]);
      await add("eight", "a", [{ direction: "inbound", at: subDays(currentDate, 8) }]);
      await add("ignored-newer", "a", [
        { direction: "inbound", at: atFiveDays },
        { direction: "outbound", draft: true },
        { direction: "outbound", hidden: true },
        { direction: "outbound", deleted: true },
        { direction: "outbound", event: true },
        { direction: "outbound", folders: ["unselected"] },
      ]);
      await add("draft-only", "a", [{ direction: "outbound", at: atFiveDays, draft: true }]);
      await add("hidden-only", "a", [{ direction: "inbound", at: atFiveDays, hidden: true }]);
      await add("three-boundary", "a", [{ direction: "inbound", at: atThreeDays }]);
      await add("seven-boundary", "a", [{ direction: "inbound", at: atSevenDays }]);
      await add("shared-five", "individual", [{ direction: "inbound", at: atFiveDays }], true);
      await add("private-five", "private", [{ direction: "outbound", at: atFiveDays }]);
      await add("foreign-five", "foreign", [{ direction: "outbound", at: atFiveDays }]);
    });

    afterAll(async () => {
      await client.query('DELETE FROM "MessagingThread" WHERE id=ANY($1::text[]) AND "companyId"=ANY($2::text[])', [
        ids(names),
        [companyId, foreignCompanyId],
      ]);
    });

    it("combines an older-than boundary and a recent-day window using the actual message", async () => {
      expect(await dateQuery(range)).toEqual(
        ids([
          "last-date-five",
          "last-date-sent-five",
          "last-date-ignored-newer",
          "last-date-seven-boundary",
          "last-date-shared-five",
        ]),
      );
    });

    it("combines date bounds with account, folder and last direction", async () => {
      expect(
        await dateQuery([
          ...range,
          filter(FilterFieldKey.connectedAccountId, [account.a]),
          filter(FilterFieldKey.emailFolder, [folder("a")]),
          filter(FilterFieldKey.lastMessageDirection, ["inbound"]),
        ]),
      ).toEqual(ids(["last-date-five", "last-date-ignored-newer", "last-date-seven-boundary"]));
      expect(
        await dateQuery([
          ...range,
          filter(FilterFieldKey.emailFolder, [folder("a", "sent")]),
          filter(FilterFieldKey.lastMessageDirection, ["outbound"]),
        ]),
      ).toEqual(ids(["last-date-sent-five"]));
      expect(
        await dateQuery([dateFilter(FilterOperatorKey.inLastDays, 3), dateFilter(FilterOperatorKey.notInLastDays, 7)]),
      ).toEqual([]);
    });

    it("keeps inclusive and exclusive absolute timestamp boundaries exact", async () => {
      const value = atFiveDays.toISOString();
      expect(await dateQuery([dateFilter(FilterOperatorKey.gt, value)])).toEqual(
        ids(["last-date-two", "last-date-three-boundary"]),
      );
      expect(await dateQuery([dateFilter(FilterOperatorKey.gte, value)])).toEqual(
        ids([
          "last-date-two",
          "last-date-three-boundary",
          "last-date-five",
          "last-date-sent-five",
          "last-date-ignored-newer",
          "last-date-shared-five",
        ]),
      );
      expect(await dateQuery([dateFilter(FilterOperatorKey.lt, value)])).toEqual(
        ids(["last-date-eight", "last-date-seven-boundary"]),
      );
      expect(await dateQuery([dateFilter(FilterOperatorKey.lte, value)])).toEqual(
        ids([
          "last-date-eight",
          "last-date-seven-boundary",
          "last-date-five",
          "last-date-sent-five",
          "last-date-ignored-newer",
          "last-date-shared-five",
        ]),
      );
      expect(await dateQuery([dateFilter(FilterOperatorKey.between, [value, value])])).toEqual(
        ids(["last-date-five", "last-date-sent-five", "last-date-ignored-newer", "last-date-shared-five"]),
      );
    });

    it("recomputes the same range for an account owner, a shared-thread reader and another workspace", async () => {
      expect(await dateQuery(range, createMockUser({ id: peerId, companyId }))).toEqual(
        ids(["last-date-shared-five", "last-date-private-five"]),
      );
      expect(
        await dateQuery(
          [...range, filter(FilterFieldKey.connectedAccountId, [account.a])],
          createMockUser({ id: peerId, companyId }),
        ),
      ).toEqual([]);
      expect(await dateQuery(range, createMockUser({ id: foreignUserId, companyId: foreignCompanyId }))).toEqual(
        ids(["last-date-foreign-five"]),
      );
    });

    it("retains draft-inclusive Last activity as a separate filter", async () => {
      expect(
        await dateQuery([
          ...range,
          { field: FilterFieldKey.lastMessageAt, operator: FilterOperatorKey.inLastDays, value: 1 },
        ]),
      ).toEqual(ids(["last-date-ignored-newer"]));
      expect(await dateQuery([dateFilter(FilterOperatorKey.lt, "invalid date")])).toEqual([]);
    });
  });

  it("counts and pages a mailbox exceeding PostgreSQL's parameter limit", async () => {
    const subject = "Large filter regression";
    const future = new Date("2099-01-01T12:00:00.000Z");
    try {
      await client.query(
        `INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId",provider,type,"unipileThreadId",subject,state,"lastMessageAt","lastMessageIsSender","updatedAt")
        SELECT gen_random_uuid()::text,$1,$2,'mail','single','large-filter-'||n,$3,'open',$4,true,NOW() FROM generate_series(1,33000) n`,
        [companyId, account.a, subject, future.toISOString()],
      );
      await client.query(
        `INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",provider,direction,origin,sender,recipients,"bodyText","folderIds","sentAt","updatedAt")
        SELECT gen_random_uuid()::text,$1,id,$2,id,'mail','outbound','external','{}'::jsonb,'{"to":[],"cc":[],"bcc":[]}'::jsonb,'Large filter regression',ARRAY[]::text[],NOW(),NOW() FROM "MessagingThread" WHERE "companyId"=$1 AND subject=$3`,
        [companyId, account.a, subject],
      );
      await client.query('ANALYZE "MessagingThread", "MessagingMessage"');
      await runWithTenant(tenant, async () => {
        const repo = new PrismaMessagingRepo();
        const params: { filters: Filter[] } = {
          filters: [
            filter(FilterFieldKey.lastMessageDirection, ["outbound"]),
            filter(FilterFieldKey.connectedAccountId, [account.a]),
            { field: FilterFieldKey.lastMessageSentAt, operator: FilterOperatorKey.inLastDays, value: 7 },
            {
              field: FilterFieldKey.lastMessageAt,
              operator: FilterOperatorKey.gt,
              value: "2098-12-31T00:00:00.000Z",
            } as Filter,
          ],
        };
        expect(await repo.getCount(params)).toBe(33000);
        const first = await repo.getItems({ ...params, take: 5, skip: 0 });
        const second = await repo.getItems({ ...params, take: 5, skip: 5 });
        expect(first).toHaveLength(5);
        expect(second).toHaveLength(5);
        expect(new Set([...first, ...second].map(({ id }) => id)).size).toBe(10);
      });
    } finally {
      await client.query(
        'DELETE FROM "MessagingMessage" WHERE "companyId"=$1 AND "messagingThreadId" IN (SELECT id FROM "MessagingThread" WHERE "companyId"=$1 AND subject=$2)',
        [companyId, subject],
      );
      await client.query('DELETE FROM "MessagingThread" WHERE "companyId"=$1 AND subject=$2', [companyId, subject]);
    }
  }, 120000);
});
