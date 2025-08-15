FROM node:18-slim

# Install system dependencies for image conversion
RUN apt-get update && apt-get install -y \
    imagemagick \
    libraw-bin \
    libvips-dev \
    libvips-tools \
    && rm -rf /var/lib/apt/lists/*

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
