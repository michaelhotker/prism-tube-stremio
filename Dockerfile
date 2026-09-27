FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src

ENV HOST=0.0.0.0 PORT=7000 NODE_ENV=production
EXPOSE 7000
USER node
CMD ["npm", "start"]

