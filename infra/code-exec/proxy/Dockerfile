# CONNECT-allowlist egress proxy (Squid) for code-exec NET mode.
# Built by the CDK stack (ContainerImage.fromAsset("./proxy")).
FROM ubuntu/squid:latest

COPY squid.conf /etc/squid/squid.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3128
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
