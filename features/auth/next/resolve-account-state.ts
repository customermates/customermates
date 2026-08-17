import "server-only";

import { cache } from "react";

import { getRouteGuardService } from "@/core/di";

export const resolveRequestAccountState = cache(() => getRouteGuardService().resolveAccountState());
