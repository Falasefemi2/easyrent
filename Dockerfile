FROM oven/bun:1.3.13

WORKDIR /app

COPY package.json bun.lockb ./
COPY node_modules ./node_modules
COPY src ./src
COPY index.ts ./

CMD ["bun", "run", "index.ts"]
