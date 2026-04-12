FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY migrations ./migrations

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "node src/run-migrations.js && node src/index.js"]
