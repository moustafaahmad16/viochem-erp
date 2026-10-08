# Production image: builds the app, then on start applies database migrations,
# creates the first admin user if there are none, and serves the app.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/next.config.ts ./
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.mjs && npx next start -p $PORT"]
