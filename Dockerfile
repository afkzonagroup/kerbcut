# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
#
# Kerbcut CLI image. Runs as an unprivileged user. Chromium is Playwright's
# bundled headless shell build. Usage:
#   docker build -t kerbcut .
#   docker run --rm --cap-drop=ALL --security-opt no-new-privileges -v "$PWD:/work" kerbcut scan https://www.example.com/ --out-html report.html

FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68
# Chromium's sandbox needs user namespaces, which Docker's default seccomp
# profile does not allow. In this image the container is the isolation
# boundary: run it with --cap-drop=ALL --security-opt no-new-privileges.
# To keep Chromium's own sandbox as well, run with a seccomp profile that
# allows user namespaces and -e KERBCUT_BROWSER_SANDBOX=on.
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    KERBCUT_BROWSER_SANDBOX=off
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json LICENSE LICENSE-ADDITIONAL-TERMS.md NOTICE ./
RUN node node_modules/playwright-core/cli.js install --with-deps chromium-headless-shell \
    && rm -rf /var/lib/apt/lists/* /tmp/* /root/.cache /root/.npm \
    && groupadd --system kerbcut \
    && useradd --system --gid kerbcut --home-dir /home/kerbcut --create-home --shell /usr/sbin/nologin kerbcut \
    && mkdir -p /work && chown kerbcut:kerbcut /work
USER kerbcut
WORKDIR /work
ENTRYPOINT ["node", "/app/dist/cli/main.js"]
CMD ["--help"]
