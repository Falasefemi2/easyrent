FROM oven/bun:1 AS base
WORKDIR /app

# Install deps
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy rest of the app
COPY . .

# Build step if needed (adjust to your project)
RUN bun run build

EXPOSE 3000
CMD ["bun", "run", "start"]
