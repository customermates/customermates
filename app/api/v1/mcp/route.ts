import { mcpRoute } from "./mcp-route";

export const maxDuration = 60;

const handler = (request: Request) => mcpRoute(request);

export { handler as GET, handler as POST, handler as DELETE };
