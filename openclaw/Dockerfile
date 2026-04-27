FROM node:24-bookworm-slim

RUN npm install -g openclaw@latest \
  && npm cache clean --force

COPY bin/carshare-tool.mjs /usr/local/bin/carshare-tool

RUN mkdir -p /var/lib/openclaw /etc/openclaw \
  && chmod +x /usr/local/bin/carshare-tool \
  && chown -R node:node /var/lib/openclaw /etc/openclaw

ENV OPENCLAW_CONFIG_PATH=/etc/openclaw/openclaw.json5
ENV OPENCLAW_STATE_DIR=/var/lib/openclaw

USER node
WORKDIR /home/node

CMD ["openclaw", "gateway"]
