import { Status } from "@/generated/prisma";

export function joinedWorkspacePath(membership: { status: Status }): "/auth/pending" | "/" {
  return membership.status === Status.pendingAuthorization ? "/auth/pending" : "/";
}
