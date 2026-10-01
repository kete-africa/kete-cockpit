# Kete Cockpit: Vite builds, srvx serves SSR and static files. The @kete/* packages come from
# GitHub Packages: the build receives NODE_AUTH_TOKEN as a secret, never as a layer.

FROM node:22.14.0-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=secret,id=node_auth_token,env=NODE_AUTH_TOKEN \
  pnpm config set "//npm.pkg.github.com/:_authToken" "$NODE_AUTH_TOKEN" \
  && pnpm install --frozen-lockfile \
  && pnpm config delete "//npm.pkg.github.com/:_authToken"
COPY . .
# Only what runs stays: the build, then the production dependencies.
RUN pnpm build && pnpm prune --prod

FROM node:22.14.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system kete && useradd --system --gid kete --home-dir /app kete
COPY --from=build --chown=kete:kete /app/package.json ./
COPY --from=build --chown=kete:kete /app/node_modules ./node_modules
COPY --from=build --chown=kete:kete /app/dist ./dist
USER kete
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

# The static directory is an absolute path: srvx does not always resolve a relative one.
CMD ["node_modules/.bin/srvx", "serve", "--entry", "dist/server/server.js", "--static", "/app/dist/client", "--prod", "--host", "0.0.0.0", "--port", "3000"]
