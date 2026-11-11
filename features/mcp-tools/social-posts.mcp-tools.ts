import type { SocialPost, RelationRequest, SocialProfile } from "@/ee/messaging/posts/social-posts.schema";

import { z } from "zod";

import {
  formatDatesInResponse,
  mcpValidationFailure,
  providerTotal,
  ProviderTotalSchema,
  runInteractor,
  toonResult,
  untrustedToonResult,
} from "./utils";
import { untrustedText } from "./untrusted-record-content";

import { ListSocialPostsSchema } from "@/ee/messaging/posts/list-social-posts.interactor";
import { GetSocialProfileSchema } from "@/ee/messaging/posts/get-social-profile.interactor";
import { GetSocialPostSchema } from "@/ee/messaging/posts/get-social-post.interactor";
import { ListSocialPostCommentsSchema } from "@/ee/messaging/posts/list-social-post-comments.interactor";
import { ListSocialCommentReactionsSchema } from "@/ee/messaging/posts/list-social-comment-reactions.interactor";
import { ListRelationRequestsSchema } from "@/ee/messaging/posts/list-relation-requests.interactor";
import {
  PublishSocialPostResultSchema,
  PublishSocialPostSchema,
} from "@/ee/messaging/posts/publish-social-post.interactor";
import {
  CommentOnSocialPostResultSchema,
  CommentOnSocialPostSchema,
} from "@/ee/messaging/posts/comment-on-social-post.interactor";
import {
  getListSocialPostsInteractor,
  getGetSocialPostInteractor,
  getListSocialPostCommentsInteractor,
  getListSocialCommentReactionsInteractor,
  getListSocialPostReactionsInteractor,
  getGetSocialProfileInteractor,
  getListManagedCompanyPagesInteractor,
  getListRelationRequestsInteractor,
  getCreateRelationRequestInteractor,
  getAcceptRelationRequestInteractor,
  getCancelRelationRequestInteractor,
  getPublishSocialPostInteractor,
  getCommentOnSocialPostInteractor,
} from "@/core/di";

const ConnectedSocialAccountDescription =
  "The id of a connected workspace account with provider LinkedIn or Instagram and status 'ok'";

const PersonIdDescription =
  "a provider person id: a profile id, the author id of a post or comment, the sender id of a reaction, or the user id of a connection invitation";

const GetSocialPostsToolSchema = z
  .object({
    connectedAccountId: z.uuid().describe(ConnectedSocialAccountDescription),
    postId: GetSocialPostSchema.shape.postId
      .optional()
      .describe("The id of one post, as listed in a posts result. When set, every list parameter must be omitted"),
    authorIdentifier: z
      .string()
      .min(1)
      .optional()
      .describe(
        `Person whose posts are listed: 'me' for the account owner, or ${PersonIdDescription}. A messaging-thread participant identifier is a different identifier type that a profile lookup resolves to a person id. Required with cursor or a positive offset`,
      ),
    cursor: z
      .string()
      .min(1)
      .optional()
      .describe("The next_cursor of the previous response, unchanged. Requires authorIdentifier and limit"),
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
  .describe("Returns one post by postId, or lists an author's posts as a first page or as a continuation");

const GetSocialPostEngagementToolSchema = z.object({
  connectedAccountId: ListSocialPostCommentsSchema.shape.connectedAccountId.describe(ConnectedSocialAccountDescription),
  postId: ListSocialPostCommentsSchema.shape.postId.describe("The id of the post, as listed in a posts result"),
  kind: z
    .enum(["reactions", "comments"])
    .default("comments")
    .describe(
      "Which engagement to list on the post: 'comments' (default) or 'reactions'. Ignored when commentId is set, which returns the reactions on that comment",
    ),
  commentId: ListSocialCommentReactionsSchema.shape.commentId
    .optional()
    .describe(
      "The id of a comment on the post, as listed with kind=comments. When set, lists the reactions on that comment and kind is ignored",
    ),
  sortBy: ListSocialPostCommentsSchema.shape.sortBy.describe(
    "Comment ordering: MOST_RECENT or MOST_RELEVANT (comments listing only)",
  ),
  cursor: ListSocialPostCommentsSchema.shape.cursor.describe("Pagination cursor from the previous page's next_cursor"),
  offset: ListSocialPostCommentsSchema.shape.offset.describe("Pagination offset, for results without a cursor"),
  limit: ListSocialPostCommentsSchema.shape.limit.describe("Items per page (1-100, default 10)"),
});

const GetSocialProfileToolSchema = GetSocialProfileSchema.extend({
  connectedAccountId: GetSocialProfileSchema.shape.connectedAccountId.describe(ConnectedSocialAccountDescription),
  identifier: GetSocialProfileSchema.shape.identifier.describe(
    "Person: 'me'; a messaging-thread participant identifier; a provider person id (a profile id, the author id of a post or comment, the sender id of a reaction, or the user id of a connection invitation); a LinkedIn Classic public profile slug; or an Instagram username. Company (profileType=company): a Sales Navigator company id, as found in a company search or in the company_id of a current_positions entry on a lead search result, a Sales Navigator list row or a person profile; 'me' with profileType=company lists the company pages the account administers",
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
        "list = received or sent invitations (direction, optional cursor, offset, limit); invite = identifier plus optional message; accept and cancel = invitationId. Every action needs connectedAccountId.",
      ),
    connectedAccountId: z.uuid().describe(ConnectedSocialAccountDescription),
    identifier: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Required for invite: the provider person id of the recipient. A messaging-thread participant identifier is a different identifier type that a profile lookup resolves to a person id",
      ),
    message: z.string().max(300).optional().describe("Optional note sent with an invite, at most 300 characters"),
    invitationId: z
      .string()
      .min(1)
      .optional()
      .describe("Required for accept and cancel: the invitationId of an invitation returned by action list"),
    direction: ListRelationRequestsSchema.shape.direction.describe(
      "list only: received (default) lists invitations sent to the account owner; sent lists invitations the account owner sent, whose invitationId cancel takes",
    ),
    cursor: ListRelationRequestsSchema.shape.cursor.describe(
      "list only: pagination cursor from the previous page's next_cursor",
    ),
    offset: ListRelationRequestsSchema.shape.offset.describe(
      "list only: pagination offset, for results without a cursor",
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

const PublishSocialPostToolSchema = z.object({
  connectedAccountId: PublishSocialPostSchema.shape.connectedAccountId.describe(ConnectedSocialAccountDescription),
  text: PublishSocialPostSchema.shape.text.describe(
    "The post text, published exactly as given (LinkedIn at most 3000 characters, Instagram captions 2200). May be empty when fileIds or quotedPostId is set",
  ),
  fileIds: PublishSocialPostSchema.shape.fileIds.describe(
    "Optional files to attach, in order: file ids from a file value or from the files list of a record readable by the caller. Several images form a carousel; otherwise one video or one document. Together at most 25 MB. Instagram posts need at least one image or video",
  ),
  visibility: PublishSocialPostSchema.shape.visibility.describe(
    "LinkedIn only: anyone (provider default) or relations_only (the account's connections)",
  ),
  firstComment: PublishSocialPostSchema.shape.firstComment.describe(
    "Optional comment the account posts on its own post right after publishing (at most 1250 characters)",
  ),
  postAs: PublishSocialPostSchema.shape.postAs.describe(
    "LinkedIn only: the id of a company page the account administers, to publish as that page rather than as the person; the first comment is posted as the page too",
  ),
  quotedPostId: PublishSocialPostSchema.shape.quotedPostId.describe(
    "LinkedIn only: the id of the post to repost, as listed in a posts result. With empty text it is a plain repost; with text it is a quote repost",
  ),
  idempotencyKey: PublishSocialPostSchema.shape.idempotencyKey.describe(
    "Optional UUID. Repeating the identical request with the same key returns the first result with repeated true rather than publishing again; a different payload with a used key is refused",
  ),
});

const CommentOnSocialPostToolSchema = z.object({
  connectedAccountId: CommentOnSocialPostSchema.shape.connectedAccountId.describe(ConnectedSocialAccountDescription),
  postId: CommentOnSocialPostSchema.shape.postId.describe(
    "The id of the post to comment on, as listed in a posts result",
  ),
  text: CommentOnSocialPostSchema.shape.text.describe(
    "The comment text, posted exactly as given (at most 1250 characters)",
  ),
  replyToCommentId: CommentOnSocialPostSchema.shape.replyToCommentId.describe(
    "Optional id of a comment on the same post, as listed in a comments result, to reply to that comment rather than commenting on the post",
  ),
  commentAs: CommentOnSocialPostSchema.shape.commentAs.describe(
    "LinkedIn only: the id of a company page the account administers, to comment as that page rather than as the person",
  ),
  idempotencyKey: CommentOnSocialPostSchema.shape.idempotencyKey.describe(
    "Optional UUID. Repeating the identical request with the same key returns the first result with repeated true rather than commenting again; a different payload with a used key is refused",
  ),
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
    title: untrustedText(post.title),
    text: untrustedText(post.text),
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
          headline: untrustedText(profileHeadline(reaction.sender)) ?? null,
          network_distance: reaction.sender.specifics?.network_distance ?? null,
        }
      : null,
  };
}

function profileHeadline(profile: Pick<SocialProfile, "description" | "specifics">) {
  return profile.specifics?.headline ?? profile.specifics?.occupation ?? profile.description;
}

function formatProfile(profile: SocialProfile, profileType: "person" | "company") {
  const currentPositions = (profile.specifics?.experience ?? [])
    .filter((entry) => entry.ended_on == null)
    .map((entry) => ({
      company: entry.company?.name ?? null,
      role: entry.job_title ?? entry.title ?? null,
      company_id: entry.company?.id ?? null,
      company_url: entry.company?.profile_url ?? null,
    }))
    .filter((position) => Object.values(position).some((value) => value != null));
  const headline = profileHeadline(profile);
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
    description: profile.description !== headline ? untrustedText(profile.description) : undefined,
    headline: untrustedText(headline),
    location: profile.location ?? profile.specifics?.location,
    industry: profile.specifics?.industry,
    current_positions: currentPositions.length > 0 ? currentPositions : null,
    network_distance: profile.specifics?.network_distance,
    can_send_inmail: profile.specifics?.can_send_inmail,
    has_pending_relation_request: profile.specifics?.relation_request != null ? true : undefined,
    followers_count: profile.followers_count ?? profile.specifics?.followers_count,
    relations_count: profile.relations_count ?? profile.specifics?.relations_count,
    shared_relations_count: profile.shared_relations_count ?? profile.specifics?.shared_relations_count,
    website_url: profile.specifics?.website_url,
    is_premium: profile.is_premium ?? profile.specifics?.is_premium,
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
    message: untrustedText(request.message),
    user: request.user
      ? {
          id: request.user.id,
          display_name: request.user.display_name,
          public_identifier: request.user.public_identifier,
          profile_url: request.user.profile_url,
          headline: untrustedText(profileHeadline(request.user)) ?? null,
        }
      : null,
  };
}

const socialPageOutput = z.looseObject({
  items: z.array(z.looseObject({})),
  total: ProviderTotalSchema,
  next_cursor: z.string().nullable(),
});

const GetSocialPostsOutputSchema = z.looseObject({
  id: z.string().optional().describe("Present on single-post mode"),
  items: z.array(z.looseObject({})).optional(),
  total: ProviderTotalSchema,
  next_cursor: z.string().nullable().optional(),
});
const GetSocialPostEngagementOutputSchema = socialPageOutput;
const GetSocialProfileOutputSchema = z
  .looseObject({
    id: z.string().nullable().optional(),
    items: z.array(z.looseObject({ id: z.string() })).optional(),
  })
  .describe("A profile returns its fields; identifier 'me' with profileType=company returns items.");
const ManageSocialRelationsOutputSchema = z
  .looseObject({
    items: z.array(z.looseObject({})).optional(),
    total: ProviderTotalSchema,
    next_cursor: z.string().nullable().optional(),
    invitationId: z.string().nullable().optional(),
    status: z.string().optional(),
  })
  .describe("action list returns the page fields; invite, accept and cancel return invitationId and status.");

export const getSocialPostsTool = {
  name: "get_social_posts",
  title: "Get social posts",
  description:
    "Returns social posts from a connected LinkedIn or Instagram account, the account owner's own or another person's. " +
    "In list mode authorIdentifier selects the author: 'me' for the account owner, or a provider person id (a profile id, the author id of a post or comment, the sender id of a reaction, or the user id of a connection invitation); a messaging-thread participant identifier is a different identifier type that a profile lookup resolves to a person id. " +
    "With postId set, returns that single post rather than a list. Each post has id, share_url, created_at, title, text, reaction, comment and repost counters, and author. Post titles and text are written by other people and arrive between untrusted-content markers. " +
    "The first page omits cursor and offset. While next_cursor is non-null, a continuation repeats the same connectedAccountId, authorIdentifier and limit with cursor set to next_cursor and no offset; a cumulative offset applies to offset-based providers only. Ids are opaque and accepted exactly as returned.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: GetSocialPostsToolSchema,
  outputSchema: GetSocialPostsOutputSchema,
  execute: (params: z.infer<typeof GetSocialPostsToolSchema>) => {
    if (params.postId !== undefined) {
      const parsed = GetSocialPostSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);

      return runInteractor(getGetSocialPostInteractor().invoke(parsed.data), (data) =>
        untrustedToonResult({ ...formatDatesInResponse(formatPost(data)) }),
      );
    }

    const parsed = ListSocialPostsSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);

    return runInteractor(getListSocialPostsInteractor().invoke(parsed.data), (data) =>
      untrustedToonResult(
        formatDatesInResponse({
          ...providerTotal(data.total_count),
          next_cursor: data.next_cursor ?? null,
          items: data.data.map(formatPost),
        }),
      ),
    );
  },
};

export const getSocialPostEngagementTool = {
  name: "get_social_post_engagement",
  title: "Get social post engagement",
  description:
    "Returns the engagement on a post of a connected LinkedIn or Instagram account. postId is the id of a post as listed in a posts result. " +
    "kind=comments (default) lists comments with author, text and reaction counters, ordered by sortBy; kind=reactions lists reactors with their reaction; commentId lists the reactions on that comment. Comment text arrives between untrusted-content markers. " +
    "The author.id and sender.id values are provider person ids that identify people in a profile lookup. Paginated with cursor (from next_cursor) or offset, plus limit. " +
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
              ...providerTotal(data.total_count),
              next_cursor: data.next_cursor ?? null,
              items: data.data.map(formatReaction),
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
              ...providerTotal(data.total_count),
              next_cursor: data.next_cursor ?? null,
              items: data.data.map(formatReaction),
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
        untrustedToonResult(
          formatDatesInResponse({
            ...providerTotal(data.total_count),
            next_cursor: data.next_cursor ?? null,
            items: data.data.map((comment) => ({
              id: comment.id,
              created_at: comment.created_at,
              text: untrustedText(comment.text),
              is_sender: comment.is_sender,
              reply_counter: comment.reply_counter,
              reactions_counter: comment.reactions_counter,
              author: comment.author
                ? {
                    id: comment.author.id,
                    display_name: comment.author.display_name,
                    public_identifier: comment.author.public_identifier,
                    profile_url: comment.author.profile_url,
                    headline: untrustedText(profileHeadline(comment.author)) ?? null,
                    network_distance: comment.author.specifics?.network_distance ?? null,
                  }
                : null,
            })),
          }),
        ),
    );
  },
};

export const getSocialProfileTool = {
  name: "get_social_profile",
  title: "Get person or company profile",
  description:
    "Returns the profile of a person or company on a connected LinkedIn or Instagram account. " +
    "Person (profileType=person): identifier is 'me', a messaging-thread participant identifier, a provider person id (the author id of a post or comment, the sender id of a reaction, the user id of a connection invitation), a LinkedIn public profile slug, or an Instagram username. " +
    "Company (profileType=company, LinkedIn only): identifier is a Sales Navigator company id or the company_id of a current_positions entry; 'me' returns the company pages the account administers as items with id, name and messaging_enabled, and such an id is the page id accepted as postAs when publishing and commentAs when commenting. " +
    "Returns id, profile_type, display_name, headline, location, profile and picture urls, follower and relation counts, network distance and current_positions (company, role, company_id). The returned id is reusable with the same profileType and, for a person, as the author id for listing posts. The headline and description arrive between untrusted-content markers. " +
    "An invalid identifier returns a validation error.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: GetSocialProfileToolSchema,
  outputSchema: GetSocialProfileOutputSchema,
  execute: (params: z.infer<typeof GetSocialProfileToolSchema>) => {
    if (params.profileType === "company" && params.identifier === "me") {
      return runInteractor(
        getListManagedCompanyPagesInteractor().invoke({ connectedAccountId: params.connectedAccountId }),
        (data) =>
          toonResult({
            items: data.data.map((page) => ({
              id: page.id,
              name: page.name,
              messaging_enabled: page.messaging_enabled,
            })),
          }),
      );
    }

    return runInteractor(getGetSocialProfileInteractor().invoke(params), (data) =>
      untrustedToonResult({ ...formatDatesInResponse(formatProfile(data, params.profileType)) }),
    );
  },
};

export const manageSocialRelationsTool = {
  name: "manage_social_relations",
  title: "Manage social relations",
  description:
    "Manages connection requests on a connected LinkedIn or Instagram account. " +
    "action list returns invitations with invitationId, user and message: direction=received (default) lists requests sent to the account owner, direction=sent the owner's pending outgoing requests; user.id is a provider person id that identifies that person in a profile lookup. A request message is written by the sender and arrives between untrusted-content markers. " +
    "action invite SENDS A REAL connection request to identifier, a provider person id; a messaging-thread participant identifier is a different identifier type that a profile lookup resolves to a person id. The optional message travels with the request. In the hosted Assistant the person is verified with the provider before the request is sent, and the request is refused when the identifier does not resolve. " +
    "action accept and action cancel take the invitationId of an invitation returned by action list; in the hosted Assistant the invitationId is also checked against the provider's first pages of invitations, and the request is refused when it is not among them. " +
    "Paginates list with cursor or offset plus limit.",
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
          untrustedToonResult(
            formatDatesInResponse({
              ...providerTotal(data.total_count),
              next_cursor: data.next_cursor ?? null,
              items: data.data.map(formatRelationRequest),
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

export const publishSocialPostTool = {
  name: "publish_social_post",
  title: "Publish social post",
  description:
    "Publishes a post from a connected LinkedIn or Instagram account. SIDE EFFECT: publishes a real post that this tool cannot take back. " +
    "connectedAccountId is a connected workspace account with provider linkedin or instagram and status ok, owned by the caller or shared. " +
    "fileIds attach files from the file field of a record readable by the caller: several images become a carousel, otherwise one video or one document. " +
    "visibility relations_only limits a LinkedIn post to the account's connections. postAs publishes as a LinkedIn company page the account administers. quotedPostId reposts that LinkedIn post: empty text is a plain repost, text makes it a quote repost. firstComment is posted on the new post right after it is published; when that fails the post stays published and comment_error names the reason. " +
    "Returns id (the post id), share_url, created_at, comment_id, comment_error and repeated. An idempotencyKey makes a retry safe: the same request with the same key returns the first result. " +
    "A failed publish with an unknown outcome may already have gone out.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: PublishSocialPostToolSchema,
  outputSchema: PublishSocialPostResultSchema,
  execute: (params: z.infer<typeof PublishSocialPostToolSchema>) => {
    const parsed = PublishSocialPostSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    return runInteractor(getPublishSocialPostInteractor().invoke(parsed.data), (data) =>
      toonResult(formatDatesInResponse(data)),
    );
  },
};

export const commentOnSocialPostTool = {
  name: "comment_on_social_post",
  title: "Comment on social post",
  description:
    "Posts a comment on a post, or a reply to a comment, from a connected LinkedIn or Instagram account. SIDE EFFECT: posts a real public comment that this tool cannot take back. " +
    "connectedAccountId is a connected workspace account with provider linkedin or instagram and status ok, owned by the caller or shared; postId is the id of a post as listed in a posts result; replyToCommentId is the id of a comment on the same post as listed in a comments result. " +
    "commentAs comments as a LinkedIn company page the account administers. " +
    "Returns id (the new comment, as listed in a comments result) and repeated. An idempotencyKey makes a retry safe: the same request with the same key returns the first result. " +
    "A failed comment with an unknown outcome may already have gone out.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: CommentOnSocialPostToolSchema,
  outputSchema: CommentOnSocialPostResultSchema,
  execute: (params: z.infer<typeof CommentOnSocialPostToolSchema>) => {
    const parsed = CommentOnSocialPostSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    return runInteractor(getCommentOnSocialPostInteractor().invoke(parsed.data), (data) => toonResult(data));
  },
};
