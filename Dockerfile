FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates git && rm -rf /var/lib/apt/lists/*

FROM base AS deps
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
COPY package.json yarn.lock ./
COPY prisma.config.ts ./prisma.config.ts
COPY prisma ./prisma
RUN yarn install --frozen-lockfile --network-timeout 600000

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV APP_MODE=self-hosted
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
ENV BASE_URL=http://localhost:4000
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# This throwaway value exists only for build-time auth initialization.
RUN BETTER_AUTH_SECRET="$(openssl rand -hex 32)" yarn build --webpack

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/yarn.lock ./yarn.lock
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/env.ts ./env.ts
COPY --from=builder /app/core/config/environment.ts ./core/config/environment.ts
COPY --from=builder /app/core/config/preview-domain.ts ./core/config/preview-domain.ts
COPY --from=builder /app/i18n ./i18n
COPY --from=builder /app/instrumentation.ts ./instrumentation.ts
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/app ./app
COPY --from=builder /app/core/fumadocs ./core/fumadocs
EXPOSE 4000
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && yarn workflow:setup && exec yarn start"]
