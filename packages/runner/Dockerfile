FROM node:24-slim AS build
WORKDIR /app
COPY package.json tsconfig.build.json ./
COPY src ./src
RUN npm install --no-save --no-audit --no-fund typescript@5.6.3 @types/node@24 \
  && npx tsc -p tsconfig.build.json

FROM node:24-slim
ARG CLIENT_PACKAGES="@anthropic-ai/claude-code @openai/codex @google/gemini-cli"
LABEL org.opencontainers.image.source="https://github.com/customermates/customermates" \
  org.opencontainers.image.description="Runs the agent jobs of a Customermates workspace with your own Claude Code, Codex or Gemini CLI." \
  org.opencontainers.image.licenses="SEE LICENSE IN LICENSE.md"
RUN npm install --global --no-audit --no-fund ${CLIENT_PACKAGES}
WORKDIR /app
COPY package.json ./
COPY --from=build /app/dist ./dist
USER node
ENV HOME=/home/node
ENTRYPOINT ["node", "/app/dist/cli.js"]
