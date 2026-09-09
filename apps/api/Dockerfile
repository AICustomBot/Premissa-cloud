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

# Load the complete Nest module graph without starting the HTTP server. This
# catches invalid ESM specifiers and missing runtime packages during Cloud
# Build, instead of shipping an image that crashes before binding PORT.
RUN node --input-type=module \
  --eval "await import('./apps/api/dist/app.module.js'); console.log('API module graph resolved')"

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --uid 10001 --create-home permissa
COPY --from=build --chown=permissa:permissa /app /app
USER permissa

EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]
