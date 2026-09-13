# ---- build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm install

COPY server server
COPY web web
RUN npm run build --workspace server
RUN npm run build --workspace web

# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
RUN npm install --omit=dev --workspace server

RUN useradd --system --uid 10001 buster
USER buster

EXPOSE 8081
CMD ["node", "server/dist/index.js"]
