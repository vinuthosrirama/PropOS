FROM node:20-alpine

WORKDIR /app

# Install root deps (Vite, React, etc.) and server deps in one layer
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci && cd server && npm ci

# Copy all source files
COPY . .

# Build Vite frontend → dist/
RUN npm run build

EXPOSE 3001
CMD ["server/node_modules/.bin/tsx", "server/index.ts"]
