import { z } from "zod";

import { UnipileUserSchema } from "../unipile.schema";

const SocialReactionsCounterSchema = z
  .array(z.looseObject({ reaction: z.string().nullish(), count: z.number().nullish() }))
  .nullish();

export const SocialPostSchema = z.looseObject({
  object: z.literal("Post").nullish(),
  id: z.string(),
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
  next_cursor: z.string().nullish(),
});
export type SocialPostList = z.infer<typeof SocialPostListSchema>;

export const SocialCommentListSchema = z.looseObject({
  data: z.array(SocialCommentSchema),
  total_count: z.number().nullish(),
  next_cursor: z.string().nullish(),
});
export type SocialCommentList = z.infer<typeof SocialCommentListSchema>;

export const SocialReactionListSchema = z.looseObject({
  data: z.array(SocialReactionSchema),
  total_count: z.number().nullish(),
  next_cursor: z.string().nullish(),
});
export type SocialReactionList = z.infer<typeof SocialReactionListSchema>;

const SocialProfileSpecificsSchema = z.looseObject({
  member_id: z.string().nullish(),
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

export const SocialProfileSchema = z.looseObject({
  object: z.enum(["User", "UserProfile"]).nullish(),
  id: z.string(),
  type: z.enum(["individual", "organization", "other"]).nullish(),
  public_identifier: z.string().nullish(),
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
  next_cursor: z.string().nullish(),
});
export type RelationRequestList = z.infer<typeof RelationRequestListSchema>;

export const RelationRequestResultSchema = z.looseObject({
  object: z.string().nullish(),
  id: z.string().nullish(),
});
export type RelationRequestResult = z.infer<typeof RelationRequestResultSchema>;
