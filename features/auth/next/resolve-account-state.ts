import "server-only";

import { cache } from "react";

import { getRouteGuardService } from "@/core/di";

export const resolveDefaultAccountState = cache(() => getRouteGuardService().resolveAccountState());
