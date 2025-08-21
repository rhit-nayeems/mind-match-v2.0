# backend/Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY app/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
EXPOSE 8000
# 1 worker, no --factory
CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0:8000", "app:create_app"]