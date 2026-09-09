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
# policy without opening an HTTP listener. abortOnError=false is essential:
# otherwise Nest calls process.exit(1) and hides the underlying exception from
# Cloud Build. The catch below makes the exact startup failure actionable.
RUN NODE_ENV=production \
    FIRESTORE_PROJECT_ID=build-smoke-test \
    FIRESTORE_DATABASE_ID=premissadb \
    PERMISSA_REQUIRE_DURABLE_STORE=true \
    node --input-type=module --eval \
    "try { const { NestFactory } = await import('@nestjs/core'); const { AppModule } = await import('./apps/api/dist/app.module.js'); const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'], abortOnError: false }); await app.close(); console.log('API production context initialized'); } catch (error) { console.error('API production context failed'); console.error(error instanceof Error ? error.stack : error); process.exit(1); }"

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --uid 10001 --create-home permissa
COPY --from=build --chown=permissa:permissa /app /app
USER permissa

EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]
