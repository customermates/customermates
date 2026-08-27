import type { SocialPost, RelationRequest, SocialProfile } from "@/ee/messaging/posts/social-posts.schema";

import { z } from "zod";

import { formatDatesInResponse, mcpValidationFailure, runInteractor, toonResult } from "./utils";

import { ListSocialPostsSchema } from "@/ee/messaging/posts/list-social-posts.interactor";
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
  "get_workspace_context.connectedAccounts[].id for a LinkedIn or Instagram account with get_workspace_context.connectedAccounts[].status='ok'";

const GetSocialPostsToolSchema = z
  .object({
    connectedAccountId: z.uuid().describe(ConnectedSocialAccountDescription),
    postId: GetSocialPostSchema.shape.postId
      .optional()
      .describe("get_social_posts.items[].id. When set, omit every list parameter"),
    authorIdentifier: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Person whose posts to list: 'me', get_social_profile.id, get_social_posts.items[].author.id from list mode, get_social_posts.author.id from single-post mode, get_social_post_engagement.items[].author.id for comments, get_social_post_engagement.items[].sender.id for reactions, or manage_social_relations.items[].user.id from action=list. For get_messaging_threads.items[].participants[].identifier or get_messaging_threads.thread.participants[].identifier, call get_social_profile first and use get_social_profile.id. Required with cursor or a positive offset",
      ),
    cursor: z
      .string()
      .min(1)
      .optional()
      .describe("Previous response's next_cursor, passed unchanged. Requires authorIdentifier and limit"),
    offset: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Positive cumulative number of posts already returned. Requires authorIdentifier and limit"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Posts per page (1-100; defaults to 10 on the first page)"),
  })
  .strict()
  .describe("Fetch one post by postId, or list an author's posts with the first-page or continuation contract");

const GetSocialPostEngagementToolSchema = z.object({
  connectedAccountId: ListSocialPostCommentsSchema.shape.connectedAccountId.describe(ConnectedSocialAccountDescription),
  postId: ListSocialPostCommentsSchema.shape.postId.describe("get_social_posts.items[].id"),
  kind: z
    .enum(["reactions", "comments"])
    .default("comments")
    .describe(
      "Which engagement to list on the post: 'comments' (default) or 'reactions'. Ignored when commentId is set (comment reactions are always returned then)",
    ),
  commentId: ListSocialCommentReactionsSchema.shape.commentId
    .optional()
    .describe(
      "get_social_post_engagement.items[].id from kind=comments. When set, lists reactions on that comment and kind is ignored",
    ),
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
    "Person: 'me'; get_messaging_threads.items[].participants[].identifier or get_messaging_threads.thread.participants[].identifier; get_social_posts.items[].author.id from list mode or get_social_posts.author.id from single-post mode; get_social_post_engagement.items[].author.id or get_social_post_engagement.items[].sender.id; manage_social_relations.items[].user.id from action=list; a LinkedIn Classic public profile slug; or an Instagram username. Company: linkedin_search_sales_companies.items[].id, linkedin_search_sales_leads.items[].current_positions[].company_id, linkedin_manage_sales_lists.items[].current_positions[].company_id from action=browse, or get_social_profile.current_positions[].company_id, with profileType=company",
  ),
  profileType: GetSocialProfileSchema.shape.profileType.describe(
    "What to retrieve: person (default) or company. Company lookup requires a LinkedIn account",
  ),
});

const ManageSocialRelationsToolSchema = z
  .object({
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
        "Required for invite: get_social_profile.id. For get_messaging_threads.items[].participants[].identifier or get_messaging_threads.thread.participants[].identifier, call get_social_profile first and use get_social_profile.id",
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
      .describe("Required for accept and cancel: manage_social_relations.items[].invitationId from action=list"),
    direction: ListRelationRequestsSchema.shape.direction.describe(
      "list only: received (default) lists invitations sent TO you; sent lists invitations YOU sent (use manage_social_relations.items[].invitationId to cancel)",
    ),
    cursor: ListRelationRequestsSchema.shape.cursor.describe(
      "list only: pagination cursor from the previous page's next_cursor",
    ),
    offset: ListRelationRequestsSchema.shape.offset.describe(
      "list only: pagination offset; use only when no cursor is available",
    ),
    limit: ListRelationRequestsSchema.shape.limit.describe("list only: items per page (1-100, default 10)"),
  })
  .superRefine((data, ctx) => {
    if (data.action === "invite" && !data.identifier)
      ctx.addIssue({ code: "custom", path: ["identifier"], message: "identifier is required for invite." });
    if ((data.action === "accept" || data.action === "cancel") && !data.invitationId) {
      ctx.addIssue({
        code: "custom",
        path: ["invitationId"],
        message: "invitationId is required for accept and cancel.",
      });
    }
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

const socialPageOutput = z.looseObject({
  items: z.array(z.looseObject({})),
  total: z.number(),
  next_cursor: z.string().nullable(),
});

const GetSocialPostsOutputSchema = z.looseObject({
  id: z.string().optional().describe("Present on single-post mode"),
  items: z.array(z.looseObject({})).optional(),
  total: z.number().optional(),
  next_cursor: z.string().nullable().optional(),
});
const GetSocialPostEngagementOutputSchema = socialPageOutput;
const GetSocialProfileOutputSchema = z.looseObject({ id: z.string().nullable().optional() });
const ManageSocialRelationsOutputSchema = z
  .looseObject({
    items: z.array(z.looseObject({})).optional(),
    total: z.number().optional(),
    next_cursor: z.string().nullable().optional(),
    invitationId: z.string().nullable().optional(),
    status: z.string().optional(),
  })
  .describe("action list returns the page fields; invite, accept and cancel return invitationId and status.");

export const getSocialPostsTool = {
  name: "get_social_posts",
  title: "Get social posts",
  description:
    "Use this when the user wants to see social posts from a connected LinkedIn or Instagram account, their own or someone else's. " +
    "For the account owner's posts, use authorIdentifier='me'. For another person, use get_social_profile.id, get_social_posts.items[].author.id from list mode, get_social_posts.author.id from single-post mode, get_social_post_engagement.items[].author.id for comments, get_social_post_engagement.items[].sender.id for reactions, or manage_social_relations.items[].user.id from action=list. For get_messaging_threads.items[].participants[].identifier or get_messaging_threads.thread.participants[].identifier, call get_social_profile first and use get_social_profile.id. " +
    "Pass get_social_posts.items[].id as postId to fetch a single post instead. " +
    "Returns id, share_url, created_at, title, text, and reaction, comment and repost counters. " +
    "For the first page omit cursor and offset. When next_cursor is returned, repeat the same connectedAccountId, authorIdentifier and limit, pass next_cursor unchanged as cursor, and omit offset. Stop when next_cursor is null. Use a positive cumulative offset only for providers that return offset-based pages. LinkedIn user posts use cursors. " +
    "A nonexistent post id can surface as a generic provider error rather than a not-found message.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: GetSocialPostsToolSchema,
  outputSchema: GetSocialPostsOutputSchema,
  execute: (params: z.infer<typeof GetSocialPostsToolSchema>) => {
    if (params.postId !== undefined) {
      const parsed = GetSocialPostSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);

      return runInteractor(getGetSocialPostInteractor().invoke(parsed.data), (data) =>
        toonResult({ ...formatDatesInResponse(formatPost(data)) }),
      );
    }

    const parsed = ListSocialPostsSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);

    return runInteractor(getListSocialPostsInteractor().invoke(parsed.data), (data) =>
      toonResult(
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
    "Requires postId from get_social_posts.items[].id. " +
    "kind=comments (default) lists the post's comments with author, text and reaction counters, sorted by sortBy (MOST_RECENT or MOST_RELEVANT); get_social_post_engagement.items[].author.id can identify that person in get_social_profile. " +
    "kind=reactions lists who reacted to the post, each row with the reaction value and the reactor's name and profile; get_social_post_engagement.items[].sender.id can identify that person in get_social_profile. " +
    "Set commentId to list the reactions on that specific comment instead (kind is ignored then). " +
    "Paginate with cursor (from next_cursor) or offset, plus limit. " +
    "A nonexistent post or comment id can surface as a generic provider error rather than a not-found message.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: GetSocialPostEngagementToolSchema,
  outputSchema: GetSocialPostEngagementOutputSchema,
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
          toonResult(
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
          toonResult(
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
        toonResult(
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
    "For a person, keep profileType=person and pass 'me'; get_messaging_threads.items[].participants[].identifier or get_messaging_threads.thread.participants[].identifier; get_social_posts.items[].author.id from list mode or get_social_posts.author.id from single-post mode; get_social_post_engagement.items[].author.id or get_social_post_engagement.items[].sender.id; manage_social_relations.items[].user.id from action=list; a LinkedIn Classic public profile slug; or an Instagram username. " +
    "For a LinkedIn company, set profileType=company and pass linkedin_search_sales_companies.items[].id, linkedin_search_sales_leads.items[].current_positions[].company_id, linkedin_manage_sales_lists.items[].current_positions[].company_id from action=browse, or get_social_profile.current_positions[].company_id. " +
    "Returns id, profile_type (the lookup route used), provider-reported type, display_name, headline, location, profile and picture urls, follower and relation counts, network distance and current_positions (company, role, company_id) where available. Reuse get_social_profile.id with the same profileType; a person get_social_profile.id is also a get_social_posts.authorIdentifier. " +
    "An invalid identifier returns a validation error without retrying the same value.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: GetSocialProfileToolSchema,
  outputSchema: GetSocialProfileOutputSchema,
  execute: (params: z.infer<typeof GetSocialProfileToolSchema>) =>
    runInteractor(getGetSocialProfileInteractor().invoke(params), (data) =>
      toonResult({ ...formatDatesInResponse(formatProfile(data, params.profileType)) }),
    ),
};

export const manageSocialRelationsTool = {
  name: "manage_social_relations",
  title: "Manage social relations",
  description:
    "Use this to manage connection / relation requests on a connected LinkedIn or Instagram account. " +
    "action list returns invitations as items with invitationId, user and any message: direction=received (default) lists requests sent TO the account owner; direction=sent lists the owner's own outgoing/pending requests (use it to find the invitationId for cancel). manage_social_relations.items[].user.id can identify that person in get_social_profile. " +
    "action invite SENDS A REAL connection request to identifier=get_social_profile.id. For get_messaging_threads.items[].participants[].identifier or get_messaging_threads.thread.participants[].identifier, call get_social_profile first and use get_social_profile.id. The optional message is delivered with the request; confirm with the user before sending. The hosted Assistant verifies the person from the provider immediately before asking for approval. " +
    "action accept confirms a received request by invitationId from manage_social_relations.items[].invitationId returned by action=list. " +
    "action cancel withdraws or refuses a request by that invitationId. " +
    "Use get_workspace_context.connectedAccounts[].id as connectedAccountId. Paginate list with cursor or offset plus limit.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: ManageSocialRelationsToolSchema,
  outputSchema: ManageSocialRelationsOutputSchema,
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
          toonResult(
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
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(
        getCreateRelationRequestInteractor().invoke({
          connectedAccountId: parsed.data.connectedAccountId,
          identifier: parsed.data.identifier,
          message: parsed.data.message,
        }),
        (data) => toonResult({ invitationId: data.id ?? null, status: data.object ?? "sent" }),
      );
    }
    const parsed = RelationByInvitationSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    if (params.action === "accept") {
      return runInteractor(
        getAcceptRelationRequestInteractor().invoke({
          connectedAccountId: parsed.data.connectedAccountId,
          invitationId: parsed.data.invitationId,
        }),
        (data) => toonResult({ invitationId: parsed.data.invitationId, status: data.object ?? "accepted" }),
      );
    }
    return runInteractor(
      getCancelRelationRequestInteractor().invoke({
        connectedAccountId: parsed.data.connectedAccountId,
        invitationId: parsed.data.invitationId,
      }),
      (data) => toonResult({ invitationId: parsed.data.invitationId, status: data.object ?? "canceled" }),
    );
  },
};
