import { describe, expect, it } from "vitest";

import { GetSocialPostSchema } from "../get-social-post.interactor";
import { GetSocialProfileSchema } from "../get-social-profile.interactor";
import { getSocialProfileOperation } from "../get-social-profile.openapi";
import { ListSocialPostsSchema } from "../list-social-posts.interactor";
import { getSocialPostsOperation } from "../list-social-posts.openapi";

type RequestExample = { value: unknown };
type JsonMediaType = { examples?: Record<string, RequestExample> };

function jsonRequestExamples(operation: unknown): Record<string, RequestExample> {
  const content = (operation as { requestBody: { content: Record<string, JsonMediaType> } }).requestBody.content;
  return content["application/json"].examples ?? {};
}

describe("social read OpenAPI examples", () => {
  it("keeps every social-post example valid against its canonical actor schema", () => {
    const examples = jsonRequestExamples(getSocialPostsOperation);

    expect(Object.keys(examples)).toEqual([
      "accountOwnerFirstPage",
      "personFirstPage",
      "cursorContinuation",
      "offsetContinuation",
      "singlePost",
    ]);

    for (const [name, example] of Object.entries(examples)) {
      const schema =
        typeof example.value === "object" && example.value !== null && Object.hasOwn(example.value, "postId")
          ? GetSocialPostSchema
          : ListSocialPostsSchema;

      expect(schema.safeParse(example.value).success, name).toBe(true);
    }
  });

  it("keeps every social-profile example valid against its canonical actor schema", () => {
    const examples = jsonRequestExamples(getSocialProfileOperation);

    expect(Object.keys(examples)).toEqual(["accountOwner", "linkedInPerson", "linkedInCompany"]);
    for (const [name, example] of Object.entries(examples))
      expect(GetSocialProfileSchema.safeParse(example.value).success, name).toBe(true);
  });

  it("keeps single-post and list inputs disjoint", () => {
    expect(
      GetSocialPostSchema.safeParse({
        connectedAccountId: "00000000-0000-4000-8000-000000000001",
        postId: "post-1",
        authorIdentifier: "me",
      }).success,
    ).toBe(false);
    expect(
      ListSocialPostsSchema.safeParse({
        connectedAccountId: "00000000-0000-4000-8000-000000000001",
        authorIdentifier: "me",
        limit: 10,
        postId: "post-1",
      }).success,
    ).toBe(false);
  });
});
