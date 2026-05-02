FROM node:24-bookworm-slim

WORKDIR /app/runtime
COPY runtime/package.json runtime/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY runtime ./
COPY config /app/config
COPY agent-systems /app/agent-systems

ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
