FROM python:3.11-slim

# Install Node.js for frontend build
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build frontend
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci

ARG CACHE_BUST=none
COPY frontend/ frontend/
RUN cd frontend && npm run build

# Set up backend
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
RUN pip install --no-cache-dir gunicorn

COPY backend/ backend/

# Copy frontend build to backend static directory (clear first to avoid stale files)
RUN rm -rf backend/static && cp -r frontend/dist backend/static

EXPOSE 8000

WORKDIR /app/backend
CMD ["gunicorn", "main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--timeout", "120"]
