# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy frontend package files
COPY frontend/package.json frontend/package-lock.json* ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy frontend source
COPY frontend/ ./

# Build the frontend
RUN npm run build

# Stage 2: Build Go backend
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app

# Copy go mod files
COPY backend/go.mod ./

# Download dependencies
RUN go mod download

# Copy backend source
COPY backend/ .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /audio-share-backend

# Stage 3: Final image
FROM alpine:3.20

# Install ca-certificates for HTTPS requests (ntfy)
RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy backend binary
COPY --from=backend-builder /audio-share-backend .

# Copy frontend build to static directory
COPY --from=frontend-builder /app/dist ./static

# Create non-root user
RUN adduser -D -g '' appuser
USER appuser

EXPOSE 8080

ENV PORT=8080
ENV STATIC_DIR=/app/static
ENV CONTENT_DIR=/app/content

CMD ["./audio-share-backend"]
