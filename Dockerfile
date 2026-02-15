# The Hollows - Dockerfile
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install dependencies for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies (include devDependencies for tsc build)
RUN npm ci

# Copy source code
COPY . .

# Build server TypeScript
RUN npm run build

# Build Svelte combat client
RUN cd client && npm ci && npm run build

# Create data directory for SQLite (Railway volume mounts here at /app/data)
RUN mkdir -p /app/data

# Set default database path (Railway volume should be mounted at /app/data)
ENV DATABASE_PATH=/app/data/hollows.db

# Expose port (Railway sets PORT dynamically)
EXPOSE ${PORT:-4000}

# Health check using dynamic PORT
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const port = process.env.PORT || 4000; require('http').get('http://localhost:' + port + '/', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start server
CMD ["npm", "start"]
