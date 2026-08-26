import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { GetSocialPostSchema } from "../get-social-post.interactor";
import { GetSocialProfileSchema } from "../get-social-profile.interactor";
import { getSocialProfileOperation } from "../get-social-profile.openapi";
import { ListSocialPostsSchema } from "../list-social-posts.interactor";
import { getSocialPostsOperation } from "../list-social-posts.openapi";
import { SocialPostsBodySchema, SocialPostsRuntimeBodySchema } from "../social-post-request.schema";
import { SocialPostListSchema, SocialProfileSchema } from "../social-posts.schema";

type RequestExample = { value: unknown };
type JsonMediaType = {
  examples?: Record<string, RequestExample>;
  schema?: unknown;
};

function jsonRequestMedia(operation: unknown): JsonMediaType {
  return (operation as { requestBody: { content: Record<string, JsonMediaType> } }).requestBody.content[
    "application/json"
  ];
}

function schemaNodes(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  const node = value as Record<string, unknown>;
  const children = Array.isArray(node.anyOf) ? node.anyOf.flatMap(schemaNodes) : [];
  return [node, ...children];
}

describe("social read public contract", () => {
  it("publishes named request examples that validate against the runtime schemas", () => {
    const postExamples = jsonRequestMedia(getSocialPostsOperation).examples ?? {};
    expect(Object.keys(postExamples)).toEqual([
      "accountOwnerFirstPage",
      "personFirstPage",
      "cursorContinuation",
      "singlePost",
    ]);
    for (const [name, example] of Object.entries(postExamples))
      expect(SocialPostsBodySchema.safeParse(example.value).success, name).toBe(true);
    for (const name of ["accountOwnerFirstPage", "personFirstPage", "cursorContinuation"])
      expect(ListSocialPostsSchema.safeParse(postExamples[name].value).success, name).toBe(true);

    expect(GetSocialPostSchema.safeParse(postExamples.singlePost.value).success).toBe(true);
    expect(SocialPostsBodySchema.parse(postExamples.singlePost.value)).toEqual(postExamples.singlePost.value);

    const profileExamples = jsonRequestMedia(getSocialProfileOperation).examples ?? {};
    expect(Object.keys(profileExamples)).toEqual(["accountOwner", "linkedInPerson", "linkedInCompany"]);
    for (const [name, example] of Object.entries(profileExamples))
      expect(GetSocialProfileSchema.safeParse(example.value).success, name).toBe(true);
  });

  it("makes continuation requirements explicit in generated OpenAPI", () => {
    const spec = generateOpenApiSpec() as {
      paths: Record<string, { post: unknown }>;
    };
    const media = jsonRequestMedia(spec.paths["/v1/messaging/social-posts/search"].post);
    const singlePostSchema = schemaNodes(media.schema).find((node) => node.title === "Single post");
    const cursorSchema = schemaNodes(media.schema).find((node) => node.title === "Cursor continuation");
    const offsetSchema = schemaNodes(media.schema).find((node) => node.title === "Offset continuation");

    expect(singlePostSchema?.required).toEqual(expect.arrayContaining(["connectedAccountId", "postId"]));
    expect(cursorSchema?.required).toEqual(
      expect.arrayContaining(["connectedAccountId", "authorIdentifier", "cursor", "limit"]),
    );
    expect(offsetSchema?.required).toEqual(
      expect.arrayContaining(["connectedAccountId", "authorIdentifier", "offset", "limit"]),
    );
    expect(
      [singlePostSchema, cursorSchema, offsetSchema].every((schema) => schema?.additionalProperties === false),
    ).toBe(true);
  });

  it("rejects ambiguous or identity-changing continuations", () => {
    expect(
      SocialPostsBodySchema.safeParse({
        connectedAccountId: "00000000-0000-4000-8000-000000000001",
        cursor: "cursor-2",
        limit: 10,
      }).success,
    ).toBe(false);
    expect(
      ListSocialPostsSchema.safeParse({
        connectedAccountId: "00000000-0000-4000-8000-000000000001",
        authorIdentifier: "ACoAAProviderProfileId",
        cursor: "cursor-2",
        offset: 10,
        limit: 10,
      }).success,
    ).toBe(false);
  });

  it("keeps legacy continuation defaults at runtime without advertising them", () => {
    const request = {
      connectedAccountId: "00000000-0000-4000-8000-000000000001",
      cursor: "cursor-2",
    };

    expect(SocialPostsBodySchema.safeParse(request).success).toBe(false);
    expect(SocialPostsRuntimeBodySchema.parse(request)).toEqual({
      ...request,
      authorIdentifier: "me",
      limit: 10,
    });
    expect(
      SocialPostsRuntimeBodySchema.parse({
        connectedAccountId: "00000000-0000-4000-8000-000000000001",
        postId: "post-1",
        authorIdentifier: "me",
        limit: 10,
      }),
    ).toEqual({
      connectedAccountId: "00000000-0000-4000-8000-000000000001",
      postId: "post-1",
    });
  });

  it("keeps list and single-post modes disjoint", () => {
    expect(
      SocialPostsBodySchema.safeParse({
        connectedAccountId: "00000000-0000-4000-8000-000000000001",
        postId: "",
      }).success,
    ).toBe(false);
    expect(
      SocialPostsBodySchema.safeParse({
        connectedAccountId: "00000000-0000-4000-8000-000000000001",
        postId: "post-1",
        authorIdentifier: "me",
      }).success,
    ).toBe(false);
  });

  it("describes reusable response fields without treating provider type as the lookup route", () => {
    expect(SocialPostListSchema.shape.next_cursor.description).toContain("repeat");
    expect(SocialProfileSchema.shape.id.description).toContain("same profileType");
    expect(SocialProfileSchema.shape.type.description).toContain("not the person/company lookup route");
    expect(SocialProfileSchema.shape.public_identifier.description).toBe(
      "Public profile slug supplied by the provider",
    );
  });
});
