# backend/Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY app/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
EXPOSE 8000
# point gunicorn at the module-level 'app' object inside app/wsgi.py
CMD ["gunicorn", "-w", "1", "--preload", "-b", "0.0.0.0:8000", "app.wsgi:app", "--timeout", "120"]

