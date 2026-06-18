import { describe, it, expect } from "vitest";

import { accountActivityAccessWhere, calendarEventAccessWhere, threadAccessWhere } from "../messaging-access";

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

  it("does not widen visibility to the whole company (account ownership is required)", () => {
    const where = accountActivityAccessWhere(COMPANY, USER);

    expect(where.connectedAccount).toBeDefined();
    expect(where).not.toEqual({ companyId: COMPANY });
  });
});
