# Use Node.js 18 LTS as base image
FROM node:18-bullseye

# Set working directory
WORKDIR /app

# Install system dependencies for image processing
RUN apt-get update && apt-get install -y \
    # ImageMagick and related libraries
    imagemagick \
    imagemagick-6.q16 \
    libmagickwand-dev \
    libmagickcore-dev \
    libmagick++-dev \
    libmagickcore-6.q16-dev \
    libmagickwand-6.q16-dev \
    libmagickcore-6.q16-6-extra \
    libmagickwand-6.q16-6 \
    libmagickcore-6.q16-6 \
    libmagick++-6.q16-dev \
    libmagick++-6.q16-8 \
    libmagickcore-6.q16-3-extra \
    libmagickwand-6.q16-3 \
    libmagickcore-6.q16-3 \
    libmagick++-6.q16-3 \
    # LibRaw for RAW image support
    libraw-bin \
    libraw-dev \
    libraw-tools \
    libraw-r \
    # dcraw for additional RAW support
    dcraw \
    dcraw-bin \
    # VIPS for high-performance image processing
    libvips-dev \
    libvips-tools \
    # Additional dependencies for better compatibility
    libjpeg-dev \
    libpng-dev \
    libtiff-dev \
    libwebp-dev \
    libheif-dev \
    # Clean up package lists to reduce image size
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Verify installations
RUN echo "=== Verifying ImageMagick installation ===" && \
    magick -version && \
    echo "=== Verifying dcraw installation ===" && \
    dcraw -V && \
    echo "=== Verifying libraw installation ===" && \
    raw-identify --help && \
    echo "=== All dependencies installed successfully ==="

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

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
