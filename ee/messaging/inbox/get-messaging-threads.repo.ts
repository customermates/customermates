import type { MessagingThread } from "../messaging.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetMessagingThreadsRepo extends BaseGetRepo<MessagingThread> {}
