# Artifact Library server.
#
#   docker build -t artifact-library .                 full image (server-side previews with Chromium)
#   docker build --target slim -t artifact-library:slim .   slim image (no browser, previews off)
#
# The build context must contain release/ (npm run build:binary or build:binaries) so the
# "artifact-cli" download page can be seeded; executables themselves are not copied in.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY skills ./skills
RUN npm run build
# Default artifacts seeded on first start: reference collection, agent guide, CLI page.
COPY examples/reference ./examples/reference
COPY release ./release
RUN node scripts/build-seed.mjs

# Production dependencies only; shared by both images.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && rm -rf /root/.npm

# Chromium for previews, cached independently of application source changes.
FROM deps AS browsers
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npx playwright install --with-deps chromium \
    && chmod -R a+rX /opt/playwright \
    && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*

FROM deps AS slim
ARG VERSION=dev
LABEL org.opencontainers.image.title="Artifact Library (slim)" \
      org.opencontainers.image.description="Self-hosted library for HTML artifacts with stable links, immutable versions and on-page feedback. Slim image: no server-side previews." \
      org.opencontainers.image.source="https://github.com/plugincompany/artifact-library" \
      org.opencontainers.image.url="https://github.com/plugincompany/artifact-library" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="Plugin Company" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data PREVIEWS=false
COPY --from=build /app/dist ./dist
COPY --from=build /app/seed ./seed
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

# Default target: the full image with previews.
FROM browsers AS full
ARG VERSION=dev
LABEL org.opencontainers.image.title="Artifact Library" \
      org.opencontainers.image.description="Self-hosted library for HTML artifacts with stable links, immutable versions, server-side previews and on-page feedback agents can read." \
      org.opencontainers.image.source="https://github.com/plugincompany/artifact-library" \
      org.opencontainers.image.url="https://github.com/plugincompany/artifact-library" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="Plugin Company" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
COPY --from=build /app/dist ./dist
COPY --from=build /app/seed ./seed
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
