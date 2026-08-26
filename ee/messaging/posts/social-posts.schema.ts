import { z } from "zod";

import { UnipileUserSchema } from "../unipile.schema";

const SocialReactionsCounterSchema = z
  .array(z.looseObject({ reaction: z.string().nullish(), count: z.number().nullish() }))
  .nullish();

export const SocialPostSchema = z.looseObject({
  object: z.literal("Post").nullish(),
  id: z.string().describe("Provider post ID. Pass it as postId to fetch this post or its engagement"),
  share_url: z.string().nullish(),
  created_at: z.string().nullish(),
  title: z.string().nullish(),
  text: z.string().nullish(),
  user_reacted: z.union([z.boolean(), z.string()]).nullish(),
  is_repost: z.boolean().nullish(),
  reactions_counter: SocialReactionsCounterSchema,
  comments_counter: z.number().nullish(),
  reposts_counter: z.number().nullish(),
  author: UnipileUserSchema.nullish(),
});
export type SocialPost = z.infer<typeof SocialPostSchema>;

const SocialCommentSchema = z.looseObject({
  object: z.literal("Comment").nullish(),
  id: z.string(),
  thread_id: z.string().nullish(),
  created_at: z.string().nullish(),
  text: z.string().nullish(),
  is_sender: z.boolean().nullish(),
  reply_counter: z.number().nullish(),
  impressions_counter: z.number().nullish(),
  reactions_counter: SocialReactionsCounterSchema,
  author: UnipileUserSchema.nullish(),
});

const SocialReactionSchema = z.looseObject({
  object: z.literal("Reaction").nullish(),
  value: z.string().nullish(),
  is_sender: z.boolean().nullish(),
  sender: UnipileUserSchema.nullish(),
});

export const SocialPostListSchema = z.looseObject({
  data: z.array(SocialPostSchema),
  total_count: z.number().nullish(),
  next_cursor: z
    .string()
    .nullish()
    .describe(
      "Pass unchanged as cursor for the next page while repeating connectedAccountId, authorIdentifier and limit; null means no cursor continuation",
    ),
});
export type SocialPostList = z.infer<typeof SocialPostListSchema>;

export const SocialCommentListSchema = z.looseObject({
  data: z.array(SocialCommentSchema),
  total_count: z.number().nullish(),
  next_cursor: z
    .string()
    .nullish()
    .describe("Pass unchanged as cursor for the next page; null means no cursor continuation"),
});
export type SocialCommentList = z.infer<typeof SocialCommentListSchema>;

export const SocialReactionListSchema = z.looseObject({
  data: z.array(SocialReactionSchema),
  total_count: z.number().nullish(),
  next_cursor: z
    .string()
    .nullish()
    .describe("Pass unchanged as cursor for the next page; null means no cursor continuation"),
});
export type SocialReactionList = z.infer<typeof SocialReactionListSchema>;

const SocialProfileSpecificsSchema = z.looseObject({
  member_id: z
    .string()
    .nullish()
    .describe("Provider-specific LinkedIn member metadata; follow-up requests use the profile's top-level id"),
  network_distance: z.string().nullish(),
  can_send_inmail: z.boolean().nullish(),
  relation_request: z.looseObject({ object: z.string().nullish() }).nullish(),
  location: z.string().nullish(),
  industry: z.string().nullish(),
  headline: z.string().nullish(),
  occupation: z.string().nullish(),
  followers_count: z.number().nullish(),
  relations_count: z.number().nullish(),
  shared_relations_count: z.number().nullish(),
  is_premium: z.boolean().nullish(),
  is_influencer: z.boolean().nullish(),
  is_creator: z.boolean().nullish(),
  is_open_profile: z.boolean().nullish(),
  is_open_to_work: z.boolean().nullish(),
  website_url: z.string().nullish(),
  experience: z
    .array(
      z.looseObject({
        company: z
          .looseObject({
            name: z.string().nullish(),
            id: z.string().nullish(),
            public_identifier: z.string().nullish(),
            profile_url: z.string().nullish(),
          })
          .nullish(),
        job_title: z.string().nullish(),
        ended_on: z.string().nullish(),
      }),
    )
    .nullish(),
});

export const LinkedinCompanyProfileSchema = z.looseObject({
  object: z.literal("CompanyProfile").nullish(),
  id: z.string().describe("Provider company ID. Reuse it with profileType=company"),
  name: z.string(),
  public_identifier: z.string().nullish(),
  profile_url: z.string().nullish(),
  public_picture_url: z.string().nullish(),
  description: z.string().nullish(),
  tagline: z.string().nullish(),
  followers_count: z.number().nullish(),
  locations: z
    .array(
      z.looseObject({
        is_headquarter: z.boolean().nullish(),
        country_code: z.string().nullish(),
        city: z.string().nullish(),
        area: z.string().nullish(),
        description: z.string().nullish(),
      }),
    )
    .nullish(),
  industry: z.array(z.string()).nullish(),
  website: z.string().nullish(),
});
export type LinkedinCompanyProfile = z.infer<typeof LinkedinCompanyProfileSchema>;

export const SocialProfileSchema = z.looseObject({
  object: z.enum(["User", "UserProfile", "CompanyProfile"]).nullish(),
  id: z
    .string()
    .describe(
      "Provider profile ID. Reuse it with the same profileType; person IDs can also be used as authorIdentifier",
    ),
  type: z
    .enum(["individual", "organization", "other"])
    .nullish()
    .describe("Provider-reported profile type; this is not the person/company lookup route"),
  public_identifier: z.string().nullish().describe("Public profile slug supplied by the provider"),
  display_name: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  profile_url: z.string().nullish(),
  public_picture_url: z.string().nullish(),
  description: z.string().nullish(),
  specifics: SocialProfileSpecificsSchema.nullish(),
});
export type SocialProfile = z.infer<typeof SocialProfileSchema>;

export const RelationRequestSchema = z.looseObject({
  object: z.literal("RelationRequest").nullish(),
  type: z.enum(["sent", "received"]).nullish(),
  id: z.string(),
  created_at: z.string().nullish(),
  message: z.string().nullish(),
  user: UnipileUserSchema.nullish(),
});
export type RelationRequest = z.infer<typeof RelationRequestSchema>;

export const RelationRequestListSchema = z.looseObject({
  data: z.array(RelationRequestSchema),
  total_count: z.number().nullish(),
  next_cursor: z
    .string()
    .nullish()
    .describe("Pass unchanged as cursor for the next page; null means no cursor continuation"),
});
export type RelationRequestList = z.infer<typeof RelationRequestListSchema>;

export const RelationRequestResultSchema = z.looseObject({
  object: z.string().nullish(),
  id: z.string().nullish(),
});
export type RelationRequestResult = z.infer<typeof RelationRequestResultSchema>;
