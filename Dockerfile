# syntax=docker/dockerfile:1
# Atelier Bureau — app image (Next.js standalone), issue #7
# Build: docker compose build app

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# npm download cache kept between builds (#217)
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ is optional in the repository but copied to the runtime image
# .next/cache keeps the Turbopack cache between builds (#217); it is a
# cache mount, so it never reaches the image
RUN --mount=type=cache,target=/app/.next/cache \
    mkdir -p public && npx prisma generate && npm run build

# Prisma CLI with its full dependency tree, same version as the lock
# file, isolated from the standalone server's traced node_modules
FROM node:24-alpine AS migrate
WORKDIR /migrate
COPY --from=deps /app/node_modules/prisma/package.json /tmp/prisma.json
# Packages only Prisma Studio and `prisma dev` load are removed: `migrate
# deploy` was tested without them on an empty database (#217)
RUN --mount=type=cache,target=/root/.npm \
    npm init -y > /dev/null \
    && npm install --omit=dev --no-audit --no-fund --prefer-offline \
       "prisma@$(node -p "require('/tmp/prisma.json').version")" \
    && rm -rf node_modules/@types node_modules/elkjs \
       node_modules/@electric-sql node_modules/react-dom node_modules/lodash
COPY prisma ./prisma
COPY prisma.config.ts ./

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Next.js standalone server and static assets
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Prisma CLI, schema and migrations for `prisma migrate deploy` on start
COPY --from=migrate --chown=nextjs:nodejs /migrate ./migrate
COPY --chown=nextjs:nodejs deploy/app/entrypoint.sh ./entrypoint.sh

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["sh", "./entrypoint.sh"]
