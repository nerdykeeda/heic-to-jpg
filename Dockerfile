# Simple and reliable Dockerfile for Railway
FROM node:20-bullseye

# Set working directory
WORKDIR /app

# Install system dependencies for image processing
RUN apt-get update && apt-get install -y \
    # ImageMagick (main package includes all needed libraries)
    imagemagick \
    # LibRaw for RAW image support
    libraw-bin \
    libraw-tools \
    # dcraw for additional RAW support
    dcraw \
    # VIPS for high-performance image processing
    libvips-tools \
    # Additional image format support
    libjpeg-turbo-progs \
    libpng-tools \
    libtiff-tools \
    webp \
    # Clean up package lists to reduce image size
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Verify critical installations
RUN echo "=== Verifying installations ===" && \
    magick -version && \
    dcraw -V && \
    echo "=== All dependencies installed successfully ==="

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci

# Copy application code
COPY . .

# Build the application (CSS and JS)
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Create necessary directories
RUN mkdir -p uploads converted public

# Set proper permissions
RUN chmod 755 uploads converted public

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start the application
CMD ["npm", "start"]
