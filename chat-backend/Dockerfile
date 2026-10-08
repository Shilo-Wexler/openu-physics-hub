# Chat backend image. Built from chat-backend/: docker build -t chat-backend .
FROM python:3.14-slim

# Python writes no .pyc files and does not buffer logs, so output reaches kubectl logs at once.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src

WORKDIR /app

# Dependencies first: this layer is cached and only rebuilt when requirements.txt changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ src/

# Run as a non-root user: a break-in gets as few privileges as possible.
RUN useradd --create-home app
USER app

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
