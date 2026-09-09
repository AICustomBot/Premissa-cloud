# syntax=docker/dockerfile:1

FROM node:20-slim AS build
WORKDIR /app

# The repository now has an npm lockfile, but only the API and its two shared
# workspaces are copied into this focused build context. Keep npm install until
# the lockfile/install strategy is narrowed to these workspaces; CI uses the
# root lockfile for full-monorepo reproducibility.
COPY package.json tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN npm install --no-audit --no-fund

RUN npm run build --workspace=@permissa/contracts \
 && npm run build --workspace=@permissa/policy \
 && npm run build --workspace=@permissa/api

RUN test -f apps/api/dist/main.js \
 || (echo "Build did not produce apps/api/dist/main.js" >&2 && exit 1)

# Instantiate the complete Nest provider graph under the production storage
# policy without opening an HTTP listener. Constructing a Firestore client is
# lazy and makes no network request here. This catches ESM/CommonJS mismatches,
# missing runtime packages and startup-constructor failures during Cloud Build.
RUN NODE_ENV=production \
    FIRESTORE_PROJECT_ID=build-smoke-test \
    FIRESTORE_DATABASE_ID=premissadb \
    PERMISSA_REQUIRE_DURABLE_STORE=true \
    node --input-type=module --eval \
    "const { NestFactory } = await import('@nestjs/core'); const { AppModule } = await import('./apps/api/dist/app.module.js'); const app = await NestFactory.createApplicationContext(AppModule, { logger: false }); await app.close(); console.log('API production context initialized')"

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --uid 10001 --create-home permissa
COPY --from=build --chown=permissa:permissa /app /app
USER permissa

EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]
