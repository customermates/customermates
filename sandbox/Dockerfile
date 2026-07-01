# Sandbox executor image — built into an AWS Lambda MicroVM image by the code-exec
# CDK stack (see ../infra/code-exec/code-exec-stack.ts, AWS::Lambda::MicrovmImage),
# ARM64 (the only architecture MicroVMs support today).
#
# This image is NOT part of the Next.js app deploy. It's packaged as a zip
# (Dockerfile + runner/) and uploaded to S3 by the CDK stack (an `Asset`), which
# Lambda then builds into a MicroVM image and snapshots. It runs the agent's
# Python/JS/bash with NO secrets baked in, and reaches CRM data only through the
# app's read-only broker (deny-by-default egress is enforced at the network layer by
# the CDK stack's per-mode network connectors + CONNECT-allowlist proxies, not here).
#
# server.mjs is a plain HTTP server (POST /run) listening on port 8080 — that's the
# whole contract. No Lambda Runtime Interface Client, no adapter: MicroVMs route
# inbound HTTPS traffic straight to the port your CMD listens on (see
# https://docs.aws.amazon.com/lambda/latest/dg/microvms-networking.html).
FROM --platform=linux/arm64 node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Data-analysis libraries are installed at BUILD time (pinned) — there's no reason
# for a DATA-mode run (which can reach only the broker) to install packages live, and
# NET-mode's allowlist doesn't include package registries by accident either.
RUN pip3 install --break-system-packages --no-cache-dir numpy==2.1.3 pandas==2.2.3

WORKDIR /opt/runner
COPY runner/ ./
RUN npm install --omit=dev

# Run unprivileged.
RUN useradd -m -u 10001 sandbox
USER sandbox

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
