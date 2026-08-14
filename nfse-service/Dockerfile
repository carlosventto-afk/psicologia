FROM python:3.11-slim AS runtime
WORKDIR /app

COPY nfse-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY nfse-service/app ./app
COPY nfse-service/nfse_core ./nfse_core

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
