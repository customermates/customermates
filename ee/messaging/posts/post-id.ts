const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const FETCHABLE_PREFIX = "ugcPost:";

function decodeCompositePostId(postId: string): string[] | null {
  if (postId.length < 8 || !BASE64.test(postId)) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(postId, "base64").toString("utf8"));

    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string") ? parsed : null;
  } catch {
    return null;
  }
}

export function unipilePostIdForFetch(postId: string): string {
  const parts = decodeCompositePostId(postId);
  if (!parts) return postId;

  return parts.find((part) => part.startsWith(FETCHABLE_PREFIX)) ?? postId;
}
