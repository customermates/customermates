# Sandbox executor image for AWS Lambda MicroVMs (ARM64-only).
#
# This image is NOT part of the Next.js app deploy. It is built and pushed
# separately, then referenced by the code-exec CDK stack (see ../infra/code-exec).
# It runs the agent's Python/JS in an isolated MicroVM with NO secrets and reaches
# CRM data only through the app's read-only broker (deny-by-default egress is
# enforced at the network layer by the CDK stack, not here).
FROM --platform=linux/arm64 node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Data-analysis libraries are installed at BUILD time (pinned). There is no
# package installation at run time — the sandbox has no outbound network except
# the broker.
RUN pip3 install --break-system-packages --no-cache-dir numpy==2.1.3 pandas==2.2.3

WORKDIR /opt/runner
COPY runner/ ./

# Run unprivileged.
RUN useradd -m -u 10001 sandbox
USER sandbox

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
