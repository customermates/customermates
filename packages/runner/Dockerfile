FROM node:24-slim AS build
WORKDIR /app
COPY package.json tsconfig.build.json ./
COPY src ./src
RUN npm install --no-save --no-audit --no-fund typescript@5.6.3 @types/node@24 \
  && npx tsc -p tsconfig.build.json

FROM node:24-slim
ARG CLIENT_PACKAGES="@anthropic-ai/claude-code@2.1.326 @openai/codex@0.169.0 @google/gemini-cli@0.68.0"
LABEL org.opencontainers.image.source="https://github.com/customermates/customermates" \
  org.opencontainers.image.description="Runs the agent jobs of a Customermates workspace with your own Claude Code, Codex or Gemini CLI." \
  org.opencontainers.image.licenses="SEE LICENSE IN LICENSE.md"
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global --no-audit --no-fund ${CLIENT_PACKAGES}
WORKDIR /app
COPY package.json ./
COPY --from=build /app/dist ./dist
USER node
ENV HOME=/home/node
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/app/dist/cli.js"]
