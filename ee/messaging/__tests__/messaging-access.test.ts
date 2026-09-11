import { describe, it, expect } from "vitest";

import {
  accessibleFolderStatesWhere,
  accountActivityAccessWhere,
  calendarEventAccessWhere,
  inboxThreadVisibilityWhere,
  messageVisibilityWhere,
  threadAccessWhere,
  threadHasActivityWhere,
} from "../messaging-access";

const COMPANY = "company-1";
const USER = "user-1";

const ownedOrSharedAccount = { OR: [{ userId: USER }, { shared: true }] };

describe("messaging-access", () => {
  it("scopes account activity to owned-or-shared connected accounts within the company", () => {
    expect(accountActivityAccessWhere(COMPANY, USER)).toEqual({
      companyId: COMPANY,
      connectedAccount: { is: ownedOrSharedAccount },
    });
  });

  it("scopes calendar events to owned-or-shared connected accounts within the company", () => {
    expect(calendarEventAccessWhere(COMPANY, USER)).toEqual({
      companyId: COMPANY,
      connectedAccount: { is: ownedOrSharedAccount },
    });
  });

  it("scopes threads to owned-or-shared accounts, or threads explicitly shared to the CRM", () => {
    expect(threadAccessWhere(COMPANY, USER)).toEqual({
      companyId: COMPANY,
      OR: [{ connectedAccount: { is: ownedOrSharedAccount } }, { sharedToCrm: true }],
    });
  });

  it("loads folder state for every account that can contribute an inbox thread", () => {
    expect(accessibleFolderStatesWhere(COMPANY, USER)).toEqual({
      companyId: COMPANY,
      OR: [{ userId: USER }, { shared: true }, { threads: { some: { sharedToCrm: true } } }],
      foldersSyncedAt: { not: null },
    });
  });

  it("uses one hidden-and-folder predicate for direct and aggregate message reads", () => {
    expect(messageVisibilityWhere([])).toEqual({ isHidden: false });
    expect(messageVisibilityWhere([{ id: "account-1", visibleSet: ["inbox"] }])).toEqual({
      isHidden: false,
      OR: [
        { connectedAccountId: { notIn: ["account-1"] } },
        {
          connectedAccountId: "account-1",
          OR: [{ folderIds: { isEmpty: true } }, { folderIds: { hasSome: ["inbox"] } }],
        },
      ],
    });
  });

  it("combines thread access, activity, and selected-folder membership for inbox visibility", () => {
    expect(inboxThreadVisibilityWhere(COMPANY, USER, [{ id: "account-1", visibleSet: ["inbox"] }])).toEqual({
      companyId: COMPANY,
      OR: [{ connectedAccount: { is: ownedOrSharedAccount } }, { sharedToCrm: true }],
      AND: [
        { OR: [{ lastMessageAt: { not: null } }, { messages: { some: { isDraft: true } } }] },
        {
          OR: [
            { connectedAccountId: { notIn: ["account-1"] } },
            {
              connectedAccountId: "account-1",
              messages: {
                some: {
                  isHidden: false,
                  OR: [{ folderIds: { isEmpty: true } }, { folderIds: { hasSome: ["inbox"] } }],
                },
              },
            },
          ],
        },
      ],
    });
  });

  it("hides threads without a last message unless they hold a draft", () => {
    expect(threadHasActivityWhere()).toEqual({
      OR: [{ lastMessageAt: { not: null } }, { messages: { some: { isDraft: true } } }],
    });
  });

  it("does not widen visibility to the whole company (account ownership is required)", () => {
    const where = accountActivityAccessWhere(COMPANY, USER);

    expect(where.connectedAccount).toBeDefined();
    expect(where).not.toEqual({ companyId: COMPANY });
  });
});
