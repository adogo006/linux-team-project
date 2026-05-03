# 여기서 api 엔드포인트 생성 및 요청 처리하는 코드 작성
# db_manager/crud 이용해서 데이터를 가져오거나 저장하는 작업도 여기서 처리
# 비동기로 작성해야 요청을 효율적으로 처리할 수 있습니다. (async def, await 등 사용)

from fastapi import FastAPI, HTTPException
from typing import Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager

import os
import uuid
import httpx
from pydantic import ValidationError
from uuid import UUID

from schemas import CrawlRelayRequest, CrawlerCallbackPayload, RequestLogUpsert
from DB_manager.models import RequestStatus
from api_crud import api_create_request_log, api_get_request_log, api_update_request_log
from DB_manager.database import SessionLocal, engine
from DB_manager import models
from scheduler_runtime import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


app = FastAPI(title="InsideViral API", lifespan=lifespan)


async def notify_user_or_admin(request_id: str, status: str, error_message: Optional[str] = None, saved_rows: Optional[int] = None):
    """콜백 수신 후 알림 훅. 기본은 로그 출력, 필요 시 웹훅으로 확장."""
    print(f"[NOTIFY] request_id={request_id} status={status} saved_rows={saved_rows} error={error_message}")
    webhook_url = os.getenv("ADMIN_WEBHOOK_URL")

    if not webhook_url:
        return

    payload = {
        "request_id": request_id,
        "status": status,
        "error_message": error_message,
        "saved_rows": saved_rows,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(webhook_url, json=payload)
    except Exception as exc:
        print(f"[NOTIFY] webhook failed: {exc}")


@app.get("/")
def read_root():
    return {"message": "Welcome to InsideViral API Server"}

@app.get("/crawl/healthcheck")
async def health_check():
    endpoint = os.getenv("CRAWLER_URL") + "healthcheck" if os.getenv("CRAWLER_URL") else None
    if not endpoint:       
        raise HTTPException(status_code=500, detail="CRAWLER_URL is not configured")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(endpoint)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text if exc.response is not None else "crawler error"
        raise HTTPException(status_code=502, detail=f"crawler error: {detail}")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"crawler unavailable: {exc}")
    return {
        "message": "crawler healthcheck ok",
        "crawler_response": response.json(),
    }