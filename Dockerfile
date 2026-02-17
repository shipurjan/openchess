FROM node:24-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
WORKDIR /app
ARG GIT_COMMIT=""
ENV GIT_COMMIT=$GIT_COMMIT
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build
RUN pnpm exec esbuild server.ts --bundle --platform=node --target=node22 --format=esm --minify \
    --outfile=dist-server/server.mjs \
    --banner:js="import{createRequire as _cr}from'module';const require=_cr(import.meta.url);" \
    --external:next --external:@prisma/client --external:@prisma/adapter-pg \
    --alias:@/*=./*
RUN pnpm exec esbuild scripts/migrate.ts --bundle --platform=node --target=node22 --format=esm --minify \
    --outfile=dist-server/migrate.mjs \
    --banner:js="import{createRequire as _cr}from'module';const require=_cr(import.meta.url);"

# --- runner: standalone output + bundled server, no prisma CLI needed ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/app/generated ./app/generated
COPY --from=builder /app/dist-server/server.mjs ./server.mjs
COPY --from=builder /app/dist-server/migrate.mjs ./migrate.mjs
COPY --from=builder /app/prisma ./prisma
# Standalone traces @prisma into .pnpm/ but drops top-level symlinks
RUN mkdir -p node_modules/@prisma && cd node_modules/@prisma \
    && ln -s ../.pnpm/@prisma+client@*/node_modules/@prisma/client client \
    && ln -s ../.pnpm/@prisma+adapter-pg@*/node_modules/@prisma/adapter-pg adapter-pg

EXPOSE 3000
CMD ["sh", "-c", "node migrate.mjs && node server.mjs"]
