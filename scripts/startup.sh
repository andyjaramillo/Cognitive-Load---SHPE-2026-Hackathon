#!/bin/bash
set -e

cd backend
pip install -r requirements.txt
gunicorn main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers 2 \
  --timeout 120
