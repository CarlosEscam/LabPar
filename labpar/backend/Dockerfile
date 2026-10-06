# API de LabPar (FastAPI). No compila ni ejecuta código de estudiantes: eso lo hacen los trabajadores.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY labpar ./labpar
RUN useradd --system --uid 1000 --home-dir /app labpar \
    && mkdir -p /datos && chown labpar:labpar /datos

USER labpar
ENV LABPAR_DATOS=/datos
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/salud', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "labpar.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
