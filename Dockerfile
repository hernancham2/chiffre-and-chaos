# Etapa 1: dependencias y build del frontend
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Etapa 2: servidor (Hono sirve dist/ + API + WebSocket)
FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json tsconfig.json ./
COPY server ./server
COPY shared ./shared
COPY drizzle ./drizzle
EXPOSE 3001
CMD ["bun", "server/index.ts"]
