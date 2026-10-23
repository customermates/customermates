import { Status } from "@/generated/prisma";

export function joinedWorkspacePath(membership: { status: Status }): "/auth/pending" | "/dashboard" {
  return membership.status === Status.pendingAuthorization ? "/auth/pending" : "/dashboard";
}
