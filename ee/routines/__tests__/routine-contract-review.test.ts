import { describe, expect, it } from "vitest";

import { routineContractReview } from "../routine-contract-review";

describe("routine contract review", () => {
  it("flags explicit retired tools and endpoints without rewriting instructions", () => {
    const prompt = "Call update_deals for each renewal. Read /api/v1/contacts/{id}, then update_deals again.";
    expect(routineContractReview(prompt)).toEqual(["/api/v1/contacts/{id}", "update_deals"]);
    expect(prompt).toBe("Call update_deals for each renewal. Read /api/v1/contacts/{id}, then update_deals again.");
  });
  it("keeps ordinary CRM vocabulary and current contracts unflagged", () => {
    expect(
      routineContractReview(
        "Find contacts and open deals with query_crm_records, then call mutate_crm_record through /api/v2/records/mutate.",
      ),
    ).toEqual([]);
    expect(routineContractReview("my_update_deals_example is a field name")).toEqual([]);
  });
  it("flags the retired activity contract and deduplicates references", () => {
    expect(routineContractReview("Read /v1/messaging/activities/search and /v1/messaging/activities/search.")).toEqual([
      "/v1/messaging/activities/search",
    ]);
  });
});
