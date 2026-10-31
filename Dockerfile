FROM node:20-alpine AS assets
WORKDIR /build
COPY package.json ./
COPY package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tailwind.config.cjs ./
COPY static ./static
RUN npm run build:css

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_FILE=/app/data/rescuemind.json
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY --from=assets /build/static ./static
RUN mkdir -p /app/data && useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
