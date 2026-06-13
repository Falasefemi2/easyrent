FROM oven/bun:1.3.13

WORKDIR /app

COPY package.json ./
COPY bun.lock ./
COPY patches ./patches
COPY scripts ./scripts

RUN bun install

COPY . .

CMD ["bun", "run", "index.ts"]
