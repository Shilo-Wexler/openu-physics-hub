# Chat backend image. Built from the repo root: docker build -t chat-backend chat-backend
FROM python:3.14-slim

# Python writes no .pyc files and does not buffer logs, so output reaches kubectl logs at once.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Dependencies first: this layer is cached and only rebuilt when requirements.txt changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

# Non-root user with a fixed numeric UID: Kubernetes runAsNonRoot can only verify a number,
# not a user name. No home directory or login shell: the server needs neither.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app
USER 10001

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
