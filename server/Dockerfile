FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential cmake libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU torch first: TripoSR's requirements build torchmcubes against it.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

RUN git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR.git /opt/TripoSR \
    && pip install --no-cache-dir -r /opt/TripoSR/requirements.txt

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py providers.py selftest.py ./

ENV PYTHONPATH=/opt/TripoSR
ENV FORMFORGE_AI_PROVIDER=triposr

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health')" || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
