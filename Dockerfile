FROM ubuntu:22.04

# Install system dependencies for image conversion
RUN apt-get update && apt-get install -y \
    imagemagick \
    libraw-bin \
    dcraw \
    libvips-dev \
    libvips-tools \
    curl \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18.x
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build CSS
RUN npm run build:css:prod

# Create necessary directories
RUN mkdir -p uploads public/converted

# Expose port
EXPOSE 10000

# Start the application
CMD ["npm", "start"]
