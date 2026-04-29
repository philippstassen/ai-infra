FROM node:24-bookworm-slim

RUN npm install -g openclaw@latest \
  && npm cache clean --force

COPY bin/carshare-tool.mjs /usr/local/bin/carshare-tool
COPY bin/entrypoint.sh /usr/local/bin/openclaw-entrypoint

RUN mkdir -p /var/lib/openclaw /etc/openclaw-src \
  && chmod +x /usr/local/bin/carshare-tool /usr/local/bin/openclaw-entrypoint \
  && chown -R node:node /var/lib/openclaw /etc/openclaw-src

ENV OPENCLAW_CONFIG_PATH=/var/lib/openclaw/config/openclaw.json5
ENV OPENCLAW_STATE_DIR=/var/lib/openclaw

USER node
WORKDIR /home/node

ENTRYPOINT ["openclaw-entrypoint"]
CMD ["openclaw", "gateway"]
