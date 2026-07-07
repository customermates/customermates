import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

import { auth } from "@/core/auth/better-auth";

export const GET = oAuthProtectedResourceMetadata(auth);
