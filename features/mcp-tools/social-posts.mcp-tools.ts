import type { SocialPost, RelationRequest, SocialProfile } from "@/ee/messaging/posts/social-posts.schema";

import { z } from "zod";

import { encodeToToon, formatDatesInResponse, runInteractor, validationError } from "./utils";

import { createListSocialPostsContractSchema } from "@/ee/messaging/posts/list-social-posts.interactor";
import { GetSocialProfileSchema } from "@/ee/messaging/posts/get-social-profile.interactor";
import { GetSocialPostSchema } from "@/ee/messaging/posts/get-social-post.interactor";
import { ListSocialPostCommentsSchema } from "@/ee/messaging/posts/list-social-post-comments.interactor";
import { ListSocialCommentReactionsSchema } from "@/ee/messaging/posts/list-social-comment-reactions.interactor";
import { ListRelationRequestsSchema } from "@/ee/messaging/posts/list-relation-requests.interactor";
import {
  getListSocialPostsInteractor,
  getGetSocialPostInteractor,
  getListSocialPostCommentsInteractor,
  getListSocialCommentReactionsInteractor,
  getListSocialPostReactionsInteractor,
  getGetSocialProfileInteractor,
  getListRelationRequestsInteractor,
  getCreateRelationRequestInteractor,
  getAcceptRelationRequestInteractor,
  getCancelRelationRequestInteractor,
} from "@/core/di";

const ConnectedSocialAccountDescription =
  "LinkedIn or Instagram connected account from get_workspace_context.connectedAccounts; use its id and choose an account whose status is ok";

const SocialPostListToolSchema = createListSocialPostsContractSchema({
  connectedAccountId: ConnectedSocialAccountDescription,
  authorIdentifier:
    "Person whose posts to list: 'me', get_social_profile.id, a post or comment author.id, a reaction sender.id, or a relation-request user.id. Resolve get_messaging_threads.participants[].identifier through get_social_profile first",
});

const GetSocialPostsToolSchema = z
  .object({
    connectedAccountId: z.uuid().describe(ConnectedSocialAccountDescription),
    postId: GetSocialPostSchema.shape.postId
      .optional()
      .describe("Provider post id returned by get_social_posts. When set, omit every list parameter"),
    authorIdentifier: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Person whose posts to list: 'me', get_social_profile.id, a post or comment author.id, a reaction sender.id, or a relation-request user.id. Resolve get_messaging_threads.participants[].identifier through get_social_profile first. Required with cursor or a positive offset",
      ),
    cursor: z
      .string()
      .min(1)
      .optional()
      .describe("Previous response's next_cursor, passed unchanged. Requires authorIdentifier and limit"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Cumulative number of posts already returned. Requires authorIdentifier and limit when positive"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Posts per page (1-100; defaults to 10 on the first page)"),
  })
  .superRefine((data, context) => {
    const listFields = ["authorIdentifier", "cursor", "offset", "limit"] as const;
    if (data.postId !== undefined) {
      for (const field of listFields) {
        if (data[field] !== undefined)
          context.addIssue({ code: "custom", message: "Omit list parameters when postId is set", path: [field] });
      }
      return;
    }

    if (data.cursor !== undefined && data.offset !== undefined)
      context.addIssue({ code: "custom", message: "Use either cursor or offset, not both", path: ["offset"] });

    const isContinuation = data.cursor !== undefined || (data.offset ?? 0) > 0;
    if (isContinuation && data.authorIdentifier === undefined) {
      context.addIssue({
        code: "custom",
        message: "Repeat authorIdentifier from the previous page",
        path: ["authorIdentifier"],
      });
    }
    if (isContinuation && data.limit === undefined)
      context.addIssue({ code: "custom", message: "Repeat limit from the previous page", path: ["limit"] });
  })
  .describe("Fetch one post by postId, or list an author's posts with the first-page or continuation contract");

const GetSocialPostEngagementToolSchema = z.object({
  connectedAccountId: ListSocialPostCommentsSchema.shape.connectedAccountId.describe(ConnectedSocialAccountDescription),
  postId: ListSocialPostCommentsSchema.shape.postId.describe("Provider post id (from get_social_posts)"),
  kind: z
    .enum(["reactions", "comments"])
    .default("comments")
    .describe(
      "Which engagement to list on the post: 'comments' (default) or 'reactions'. Ignored when commentId is set (comment reactions are always returned then)",
    ),
  commentId: ListSocialCommentReactionsSchema.shape.commentId
    .optional()
    .describe("Comment id from the comments listing. When set, lists reactions on that comment and kind is ignored"),
  sortBy: ListSocialPostCommentsSchema.shape.sortBy.describe(
    "Comment ordering: MOST_RECENT or MOST_RELEVANT (comments listing only)",
  ),
  cursor: ListSocialPostCommentsSchema.shape.cursor.describe("Pagination cursor from the previous page's next_cursor"),
  offset: ListSocialPostCommentsSchema.shape.offset.describe("Pagination offset; use only when no cursor is available"),
  limit: ListSocialPostCommentsSchema.shape.limit.describe("Items per page (1-100, default 10)"),
});

const GetSocialProfileToolSchema = GetSocialProfileSchema.extend({
  connectedAccountId: GetSocialProfileSchema.shape.connectedAccountId.describe(ConnectedSocialAccountDescription),
  identifier: GetSocialProfileSchema.shape.identifier.describe(
    "Person: 'me', get_messaging_threads.participants[].identifier, a returned social-user id, a LinkedIn Classic public profile slug, or an Instagram username. Company: linkedin_search_sales_companies result id or current_positions[].company_id, with profileType=company",
  ),
  profileType: GetSocialProfileSchema.shape.profileType.describe(
    "What to retrieve: person (default) or company. Company lookup requires a LinkedIn account",
  ),
});

const ManageSocialRelationsToolSchema = z.object({
  action: z
    .enum(["list", "invite", "accept", "cancel"])
    .describe(
      "Relation-request operation: list (received or sent invitations, see direction), invite, accept, or cancel",
    ),
  connectedAccountId: z.uuid().describe(ConnectedSocialAccountDescription),
  identifier: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Required for invite: get_social_profile.id. When starting from get_messaging_threads.participants[].identifier, resolve it through get_social_profile first",
    ),
  message: z
    .string()
    .max(300)
    .optional()
    .describe("Optional note sent with an invite (LinkedIn caps the length; keep it short)"),
  invitationId: z
    .string()
    .min(1)
    .optional()
    .describe("Required for accept and cancel: the relation-request id from action list"),
  direction: ListRelationRequestsSchema.shape.direction.describe(
    "list only: received (default) lists invitations sent TO you; sent lists invitations YOU sent (use this to find the invitationId for cancel)",
  ),
  cursor: ListRelationRequestsSchema.shape.cursor.describe(
    "list only: pagination cursor from the previous page's next_cursor",
  ),
  offset: ListRelationRequestsSchema.shape.offset.describe(
    "list only: pagination offset; use only when no cursor is available",
  ),
  limit: ListRelationRequestsSchema.shape.limit.describe("list only: items per page (1-100, default 10)"),
});

const InviteRelationSchema = z.object({
  connectedAccountId: z.uuid(),
  identifier: z.string().min(1),
  message: z.string().max(300).optional(),
});

const RelationByInvitationSchema = z.object({
  connectedAccountId: z.uuid(),
  invitationId: z.string().min(1),
});

function formatPost(post: SocialPost) {
  return {
    id: post.id,
    share_url: post.share_url,
    created_at: post.created_at,
    title: post.title,
    text: post.text,
    user_reacted: post.user_reacted,
    is_repost: post.is_repost,
    reactions_counter: post.reactions_counter,
    comments_counter: post.comments_counter,
    reposts_counter: post.reposts_counter,
    author: post.author
      ? { id: post.author.id, display_name: post.author.display_name, public_identifier: post.author.public_identifier }
      : null,
  };
}

function formatReaction(reaction: {
  value?: string | null;
  is_sender?: boolean | null;
  sender?: SocialProfile | null;
}) {
  return {
    value: reaction.value,
    is_sender: reaction.is_sender,
    sender: reaction.sender
      ? {
          id: reaction.sender.id,
          display_name: reaction.sender.display_name,
          public_identifier: reaction.sender.public_identifier,
          profile_url: reaction.sender.profile_url,
          headline: reaction.sender.specifics?.headline ?? reaction.sender.specifics?.occupation ?? null,
          network_distance: reaction.sender.specifics?.network_distance ?? null,
        }
      : null,
  };
}

function formatProfile(profile: SocialProfile, profileType: "person" | "company") {
  const currentPositions = (profile.specifics?.experience ?? [])
    .filter((entry) => entry.ended_on == null)
    .map((entry) => ({
      company: entry.company?.name ?? null,
      role: entry.job_title ?? null,
      company_id: entry.company?.id ?? null,
      company_url: entry.company?.profile_url ?? null,
    }))
    .filter((position) => Object.values(position).some((value) => value != null));
  const fields = {
    id: profile.id,
    profile_type: profileType,
    type: profile.type,
    public_identifier: profile.public_identifier,
    display_name: profile.display_name,
    first_name: profile.first_name,
    last_name: profile.last_name,
    profile_url: profile.profile_url,
    picture_url: profile.public_picture_url,
    description: profile.description,
    headline: profile.specifics?.headline ?? profile.specifics?.occupation,
    location: profile.specifics?.location,
    industry: profile.specifics?.industry,
    current_positions: currentPositions.length > 0 ? currentPositions : null,
    network_distance: profile.specifics?.network_distance,
    can_send_inmail: profile.specifics?.can_send_inmail,
    has_pending_relation_request: profile.specifics?.relation_request != null ? true : undefined,
    followers_count: profile.specifics?.followers_count,
    relations_count: profile.specifics?.relations_count,
    shared_relations_count: profile.specifics?.shared_relations_count,
    website_url: profile.specifics?.website_url,
    is_premium: profile.specifics?.is_premium,
    is_influencer: profile.specifics?.is_influencer,
    is_creator: profile.specifics?.is_creator,
    is_open_to_work: profile.specifics?.is_open_to_work,
    is_open_profile: profile.specifics?.is_open_profile,
  };

  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null));
}

function formatRelationRequest(request: RelationRequest) {
  return {
    invitationId: request.id,
    type: request.type,
    created_at: request.created_at,
    message: request.message,
    user: request.user
      ? {
          id: request.user.id,
          display_name: request.user.display_name,
          public_identifier: request.user.public_identifier,
          profile_url: request.user.profile_url,
          headline: request.user.specifics?.headline ?? request.user.specifics?.occupation ?? null,
        }
      : null,
  };
}

export const getSocialPostsTool = {
  name: "get_social_posts",
  title: "Get social posts",
  description:
    "Use this when the user wants to see social posts from a connected LinkedIn or Instagram account, their own or someone else's. " +
    "For the account owner's posts, use authorIdentifier='me'. For another person, use get_social_profile.id or an id returned for a post author, comment author, reaction sender or relation-request user. Resolve a messaging thread participant's identifier through get_social_profile first. " +
    "Pass postId to fetch a single post instead. " +
    "Returns id, share_url, created_at, title, text, and reaction, comment and repost counters. " +
    "For the first page omit cursor and offset. When next_cursor is returned, repeat the same connectedAccountId, authorIdentifier and limit, pass next_cursor unchanged as cursor, and omit offset. Stop when next_cursor is null. Use a positive cumulative offset only for providers that return offset-based pages. LinkedIn user posts use cursors. " +
    "A nonexistent post id can surface as a generic provider error rather than a not-found message.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: GetSocialPostsToolSchema,
  execute: (params: z.infer<typeof GetSocialPostsToolSchema>) => {
    if (params.postId !== undefined) {
      return runInteractor(
        getGetSocialPostInteractor().invoke({
          connectedAccountId: params.connectedAccountId,
          postId: params.postId,
        }),
        (data) => encodeToToon(formatDatesInResponse(formatPost(data))),
      );
    }

    const parsed = SocialPostListToolSchema.safeParse(params);
    if (!parsed.success) return validationError(parsed.error);

    return runInteractor(getListSocialPostsInteractor().invoke(parsed.data), (data) =>
      encodeToToon(
        formatDatesInResponse({
          items: data.data.map(formatPost),
          total: data.total_count ?? data.data.length,
          next_cursor: data.next_cursor ?? null,
        }),
      ),
    );
  },
};

export const getSocialPostEngagementTool = {
  name: "get_social_post_engagement",
  title: "Get social post engagement",
  description:
    "Use this when the user wants to know who engaged with a social post on a connected LinkedIn or Instagram account. " +
    "Requires postId (from get_social_posts). " +
    "kind=comments (default) lists the post's comments with author, text and reaction counters, sorted by sortBy (MOST_RECENT or MOST_RELEVANT). " +
    "kind=reactions lists who reacted to the post, each row with the reaction value and the reactor's name and profile. " +
    "Set commentId to list the reactions on that specific comment instead (kind is ignored then). " +
    "Paginate with cursor (from next_cursor) or offset, plus limit. " +
    "A nonexistent post or comment id can surface as a generic provider error rather than a not-found message.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: GetSocialPostEngagementToolSchema,
  execute: (params: z.infer<typeof GetSocialPostEngagementToolSchema>) => {
    if (params.commentId) {
      return runInteractor(
        getListSocialCommentReactionsInteractor().invoke({
          connectedAccountId: params.connectedAccountId,
          postId: params.postId,
          commentId: params.commentId,
          cursor: params.cursor,
          offset: params.offset,
          limit: params.limit,
        }),
        (data) =>
          encodeToToon(
            formatDatesInResponse({
              items: data.data.map(formatReaction),
              total: data.total_count ?? data.data.length,
              next_cursor: data.next_cursor ?? null,
            }),
          ),
      );
    }
    if (params.kind === "reactions") {
      return runInteractor(
        getListSocialPostReactionsInteractor().invoke({
          connectedAccountId: params.connectedAccountId,
          postId: params.postId,
          cursor: params.cursor,
          offset: params.offset,
          limit: params.limit,
        }),
        (data) =>
          encodeToToon(
            formatDatesInResponse({
              items: data.data.map(formatReaction),
              total: data.total_count ?? data.data.length,
              next_cursor: data.next_cursor ?? null,
            }),
          ),
      );
    }
    return runInteractor(
      getListSocialPostCommentsInteractor().invoke({
        connectedAccountId: params.connectedAccountId,
        postId: params.postId,
        sortBy: params.sortBy,
        cursor: params.cursor,
        offset: params.offset,
        limit: params.limit,
      }),
      (data) =>
        encodeToToon(
          formatDatesInResponse({
            items: data.data.map((comment) => ({
              id: comment.id,
              created_at: comment.created_at,
              text: comment.text,
              is_sender: comment.is_sender,
              reply_counter: comment.reply_counter,
              reactions_counter: comment.reactions_counter,
              author: comment.author
                ? {
                    id: comment.author.id,
                    display_name: comment.author.display_name,
                    public_identifier: comment.author.public_identifier,
                    profile_url: comment.author.profile_url,
                    headline: comment.author.specifics?.headline ?? comment.author.specifics?.occupation ?? null,
                    network_distance: comment.author.specifics?.network_distance ?? null,
                  }
                : null,
            })),
            total: data.total_count ?? data.data.length,
            next_cursor: data.next_cursor ?? null,
          }),
        ),
    );
  },
};

export const getSocialProfileTool = {
  name: "get_social_profile",
  title: "Get person or company profile",
  description:
    "Use this when the user wants details about a person or company on a connected LinkedIn or Instagram account. " +
    "For a person, keep profileType=person and pass 'me', get_messaging_threads.participants[].identifier, a returned social-user id, a LinkedIn Classic public profile slug, or an Instagram username. " +
    "For a LinkedIn company, set profileType=company and pass linkedin_search_sales_companies result id or current_positions[].company_id from a Sales Navigator lead or person profile. " +
    "Returns id, profile_type (the lookup route used), provider-reported type, display_name, headline, location, profile and picture urls, follower and relation counts, network distance and current_positions (company, role, company_id) where available. Reuse id with the same profileType; a person id is also a get_social_posts authorIdentifier. " +
    "An invalid identifier returns a validation error without retrying the same value.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: GetSocialProfileToolSchema,
  execute: (params: z.infer<typeof GetSocialProfileToolSchema>) =>
    runInteractor(getGetSocialProfileInteractor().invoke(params), (data) =>
      encodeToToon(formatDatesInResponse(formatProfile(data, params.profileType))),
    ),
};

export const manageSocialRelationsTool = {
  name: "manage_social_relations",
  title: "Manage social relations",
  description:
    "Use this to manage connection / relation requests on a connected LinkedIn or Instagram account. " +
    "action list returns invitations, each with an invitationId, sender and any message: direction=received (default) lists requests sent TO the account owner; direction=sent lists the owner's own outgoing/pending requests (use it to find the invitationId to cancel). " +
    "action invite SENDS A REAL connection request to identifier=get_social_profile.id; when starting from a messaging thread participant, resolve participants[].identifier through get_social_profile first. The optional message is delivered with the request; confirm with the user before sending. " +
    "action accept confirms a received request by invitationId (from action list). " +
    "action cancel withdraws or refuses a request by invitationId. " +
    "Get connectedAccountId from get_workspace_context. Paginate list with cursor or offset plus limit.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: ManageSocialRelationsToolSchema,
  execute: (params: z.infer<typeof ManageSocialRelationsToolSchema>) => {
    if (params.action === "list") {
      return runInteractor(
        getListRelationRequestsInteractor().invoke({
          connectedAccountId: params.connectedAccountId,
          direction: params.direction,
          cursor: params.cursor,
          offset: params.offset,
          limit: params.limit,
        }),
        (data) =>
          encodeToToon(
            formatDatesInResponse({
              items: data.data.map(formatRelationRequest),
              total: data.total_count ?? data.data.length,
              next_cursor: data.next_cursor ?? null,
            }),
          ),
      );
    }
    if (params.action === "invite") {
      const parsed = InviteRelationSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      return runInteractor(
        getCreateRelationRequestInteractor().invoke({
          connectedAccountId: parsed.data.connectedAccountId,
          identifier: parsed.data.identifier,
          message: parsed.data.message,
        }),
        (data) => encodeToToon({ invitationId: data.id ?? null, status: data.object ?? "sent" }),
      );
    }
    const parsed = RelationByInvitationSchema.safeParse(params);
    if (!parsed.success) return validationError(parsed.error);
    if (params.action === "accept") {
      return runInteractor(
        getAcceptRelationRequestInteractor().invoke({
          connectedAccountId: parsed.data.connectedAccountId,
          invitationId: parsed.data.invitationId,
        }),
        (data) => encodeToToon({ invitationId: parsed.data.invitationId, status: data.object ?? "accepted" }),
      );
    }
    return runInteractor(
      getCancelRelationRequestInteractor().invoke({
        connectedAccountId: parsed.data.connectedAccountId,
        invitationId: parsed.data.invitationId,
      }),
      (data) => encodeToToon({ invitationId: parsed.data.invitationId, status: data.object ?? "canceled" }),
    );
  },
};
