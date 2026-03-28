#!/bin/bash
set -e

# Build frontend
cd frontend
npm ci
npm run build
cd ..

# Copy built frontend to backend/static
rm -rf backend/static
cp -r frontend/dist backend/static

echo "Build complete. Frontend copied to backend/static/"
