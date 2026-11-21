import { oAuthDiscoveryMetadata } from "better-auth/plugins";

import { auth } from "@/core/auth/better-auth";
import { publicOAuthMetadata } from "@/features/auth/oauth-discovery-request";

export const GET = publicOAuthMetadata(oAuthDiscoveryMetadata(auth));
