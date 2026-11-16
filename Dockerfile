# Backend API service (FastAPI + Google ADK) for Cloud Run.
# Deploy from the repository root:  gcloud run deploy doctor-appointment-api --source .
# The React frontend has its own Dockerfile in ./frontend.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY agents/requirements.txt agents/requirements.txt
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --upgrade pip && pip install -r backend/requirements.txt

COPY agents/ agents/
COPY backend/ backend/

RUN useradd --create-home --uid 1000 appuser && chown -R appuser /app
USER appuser

ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT} --timeout-keep-alive 75"]
