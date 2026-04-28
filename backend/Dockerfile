FROM node:20-alpine

WORKDIR /app

# Copy manifests first for better layer caching
COPY package*.json ./

# Install ALL deps (including devDeps like TypeScript needed for the build step)
RUN npm ci

# Copy source and compile
COPY . .
RUN npm run build

# Prune devDependencies so the final image only ships production deps
RUN npm prune --omit=dev

EXPOSE 3001

CMD ["node", "dist/server.js"]
