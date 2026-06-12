FROM oven/bun:1 AS base
WORKDIR /app

# Install deps
COPY package.json bun.lock* bun.lockb* ./
COPY patches ./patches
RUN bun install --frozen-lockfile

# Copy rest of the app
COPY . .

EXPOSE 3000
CMD ["bun", "run", "start"]
