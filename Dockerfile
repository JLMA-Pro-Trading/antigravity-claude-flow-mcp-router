# Production-Ready MCP Router Dockerfile

FROM node:18-alpine AS base

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcprouter -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force && \
    rm -rf ~/.npm

# Copy application code
COPY --chown=mcprouter:nodejs . .

# Remove unnecessary files
RUN rm -rf tests/ docs/ .git/ *.md

# Health check dependencies
RUN apk add --no-cache curl

# Switch to non-root user
USER mcprouter

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Use production router by default
CMD ["node", "src/production-router.js", "claude-flow"]

# Labels for better container management
LABEL maintainer="MCP Router Team"
LABEL version="4.0.0"
LABEL description="Production-ready MCP Router with health monitoring"