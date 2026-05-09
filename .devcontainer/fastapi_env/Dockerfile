FROM python:3.11-slim-bookworm

WORKDIR /fastapi

COPY ./.devcontainer/fastapi_env/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# uvicorn으로 서버 실행 (8000 포트)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]