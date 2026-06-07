FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY public ./public
COPY server ./server

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_FILE=/data/jmart.sqlite

EXPOSE 3000

CMD ["npm", "start"]
