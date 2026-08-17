# Dockerfile
FROM node:18-slim

# Install necessary packages
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies - skip frida if needed
RUN npm install --omit=optional || true

# Clean up
RUN npm cache clean --force

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build || echo "Build skipped"

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:mobile"]