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
    return {"message": "Welcome to API server"}


#크롤링 서버 확인
@app.get("/crawl/healthcheck")
async def health_check():
    endpoint = os.getenv("CRAWLER_URL") + "healthcheck" if os.getenv("CRAWLER_URL") else None
    if not endpoint:       
        raise HTTPException(status_code=500, detail="CRAWLER_URL is not configured")
    
    endpoint = crawler_url.rstrip("/") + "/healthcheck"
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

#크롤링 작업 요청
@app.post("/crawl/request")
async def create_crawl_request(payload: CrawlRelayRequest):
    request_id = str(uuid.uuid4())
    crawler_url = os.getenv("CRAWLER_URL")

    await api_create_request_log(
        RequestLogUpsert(request_id=request_id, status=RequestStatus.PENDING, created_at=datetime.now(timezone.utc))
    )

    crawler_url = os.getenv("CRAWLER_URL")
    if not crawler_url:
        raise HTTPException(status_code=500, detail="CRAWLER_URL is not find")

    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                crawler_url.rstrip("/") + "/crawl",
                json={"request_id": request_id, **payload.dict() }
            )
        await api_create_request_log(request_log)
    except Exception as e:
        await api_update_request_log(
            request_id,
            status=RequestStatus.FAILED,
            error_message=str(e)
        )
        raise HTTPException(status_code=500, detail="crawler request failed")

    return {"request_id": request_id}

#크롤링 상태 콜백
@app.post("/crawl/callback")
async def crawl_callback(payload: CrawlerCallbackPayload):
    try:
        await api_update_request_log(
            payload.request_id,
            status=payload.status,
            error_message=payload.error_message,
        )

        await notify_user_or_admin(
            request_id=payload.request_id,
            status=payload.status,
            error_message=payload.error_message,
            saved_rows=payload.saved_rows,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "callback received"}

#회원가입 요청 처리 - id 입력
@app.get("/crawl/request/{request_id}")
async def get_request_status(request_id: str):
    data = await api_get_request_log(request_id)

    if not data:
        raise HTTPException(status_code=404, detail="request not found")

    return data

#회원가입 등록 및 중복확인
@app.post("/request_register")
def request_register(payload: RegisterRequest):
    db = SessionLocal()

    try:
        existing_user = crud.get_user_by_user_id(db, payload.user_id)
        if existing_user:
            raise HTTPException(status_code=400, detail="이미 존재하는 아이디입니다.")

        existing_nickname = crud.get_user_by_nickname(db, payload.nickname)
        if existing_nickname:
            raise HTTPException(status_code=400, detail="이미 존재하는 닉네임입니다.")

        new_user = crud.create_user(
            db=db,
            user_id=payload.user_id,
            password=payload.password,
            nickname=payload.nickname,
        )

        return {
            "success": True,
            "message": "회원가입 성공",
            "user": {
                "user_id": new_user.user_id,
                "nickname": new_user.nickname,
            },
        }

    finally:
        db.close()

