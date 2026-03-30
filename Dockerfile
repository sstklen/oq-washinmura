FROM oven/bun:1 AS base

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src/ ./src/

RUN mkdir -p /app/data

EXPOSE 3100

CMD ["bun", "run", "src/index.ts"]
