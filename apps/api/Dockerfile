# syntax=docker/dockerfile:1

# This repository uses npm workspaces. It has no pnpm-workspace.yaml and no
# lockfile, so `pnpm install --frozen-lockfile` cannot be used here.
#
# Once package-lock.json is committed, change the install below to `npm ci`
# for reproducible builds. That is the only change required.

FROM node:20-slim AS build
WORKDIR /app

# Only the workspaces the API needs are copied. apps/web and apps/worker are
# deliberately excluded to keep the build context and image small; the
# workspaces globs tolerate their absence.
COPY package.json tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN npm install --no-audit --no-fund

# Dependency order matters: policy imports contracts, and the API consumes the
# emitted declarations of both. Building them out of order fails type
# resolution.
RUN npm run build --workspace=@permissa/contracts \
 && npm run build --workspace=@permissa/policy \
 && npm run build --workspace=@permissa/api

# Fail the build here rather than at container start, where the only symptom
# would be a Cloud Run revision that never becomes ready.
RUN test -f apps/api/dist/main.js \
 || (echo "Build did not produce apps/api/dist/main.js" >&2 && exit 1)

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --uid 10001 --create-home permissa
COPY --from=build --chown=permissa:permissa /app /app
USER permissa

# Cloud Run injects PORT; main.ts falls back to 8080 to match this.
EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]
