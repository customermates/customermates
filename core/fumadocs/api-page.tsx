import { createOpenAPI } from "fumadocs-openapi/server";
import { createAPIPage } from "fumadocs-openapi/ui";

import { env } from "@/env";

const openapi = createOpenAPI({
  input: [`${env.BASE_URL}/v1/openapi.json`],
});

export const APIPage = createAPIPage(openapi);
