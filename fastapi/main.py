# 여기서 api 엔드포인트 생성 및 요청 처리하는 코드 작성
# db_manager/crud 이용해서 데이터를 가져오거나 저장하는 작업도 여기서 처리
# 비동기로 작성해야 요청을 효율적으로 처리할 수 있습니다. (async def, await 등 사용)

from fastapi import FastAPI, HTTPException, Header, Depends
from typing import Optional
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from jose import jwt, JWTError

import os
import uuid
import httpx
#from pydantic import ValidationError
#from uuid import UUID

from schemas import CrawlRelayRequest, CrawlerCallbackPayload, RequestLogUpsert, RegisterRequest, LoginRequest, ProjectCreateRequest, ProjectListRequest, ProjectOpenRequest
from DB_manager.models import RequestStatus
from api_crud import api_create_request_log, api_get_request_log, api_update_request_log
from DB_manager.database import SessionLocal, engine
from DB_manager import models
from DB_manager.db_handler import engine
from scheduler_runtime import start_scheduler, stop_scheduler


SECRET_KEY = os.getenv("SECRET_KEY", "temporary-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

expired_tokens = set()

#############
#crud부르기
from DB_manager import crud

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

#################
#crawl 서버 확인
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

##################
#crawling 작업 요청
@app.post("/crawl/request")
async def create_crawl_request(payload: CrawlRelayRequest):
    request_id = str(uuid.uuid4())
    crawler_url = os.getenv("CRAWLER_URL")
    now = datetime.now(timezone.utc)

    await api_create_request_log(
        RequestLogUpsert(
            request_id=request_id,
            status=RequestStatus.PENDING,
            created_at=now,
            updated_at=now,
        )
    )

    if not crawler_url:
        await api_update_request_log(
            request_id,
            status=RequestStatus.FAILED,
            error_message="CRAWLER_URL is not configured",
        )

        raise HTTPException(status_code=500, detail="CRAWLER_URL is not configured")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                crawler_url.rstrip("/") + "/crawl",
                json={
                    "request_id": request_id,
                    **payload_to_dict(payload),
                },
            )
            response.raise_for_status()

    except httpx.HTTPStatusError as exc:
        detail = exc.response.text if exc.response is not None else "crawler error"

        await api_update_request_log(
            request_id,
            status=RequestStatus.FAILED,
            error_message=detail,
        )

        raise HTTPException(status_code=502, detail=f"crawler request failed: {detail}")

    except httpx.RequestError as exc:
        await api_update_request_log(
            request_id,
            status=RequestStatus.FAILED,
            error_message=str(exc),
        )

        raise HTTPException(status_code=503, detail=f"crawler unavailable: {exc}")

    except Exception as exc:
        await api_update_request_log(
            request_id,
            status=RequestStatus.FAILED,
            error_message=str(exc),
        )

        raise HTTPException(status_code=500, detail="crawler request failed")

    return {
        "message": "crawl request created",
        "request_id": request_id,
    }

##############
#crawl 상태 콜백
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


#############################
#회원가입 요청 처리 - id 입력
@app.get("/crawl/request/{request_id}")
async def get_request_status(request_id: str):
    data = await api_get_request_log(request_id)

    if not data:
        raise HTTPException(status_code=404, detail="요청을 처리할 수 없습니다.")

    return data


########################
##회원가입 등록 및 중복확인
@app.post("/api:8000/request_register")
def request_register(payload: RegisterRequest):
    db = SessionLocal()

    try:
        existing_user = crud.get_user_by_user_id(db, payload.user_id)
        if existing_user: #리턴값이 400 bad Request라는데 만약 TrueFalse를 프런트가 받는다면 수정필요.
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
            "message": "회원가입에 성공하셨습니다.",
            "user": {
                "user_id": new_user.user_id,
                "nickname": new_user.nickname,
            },
        }

    finally:
        db.close()


    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



#로그인 요청 받기
@app.post("/api:8000/request_login")
def request_login(payload: LoginRequest):
    db = SessionLocal()

    try:
        user = crud.get_user_by_user_id(db, payload.user_id)

        if not user:
            return {
                "success": False,
                "message": "존재하지 않는 아이디입니다.",
                "access_token": None,
                "token_type": None,
            }

        if user.password != payload.password:
            return {
                "success": False,
                "message": "비밀번호가 일치하지 않습니다.",
                "access_token": None,
                "token_type": None,
            }

        access_token = create_access_token(
            {
                "user_id": user.user_id,
                "nickname": user.nickname,
            }
        )

        return {
            "success": True,
            "message": "로그인하셨습니다.",
            "nickname": user.nickname,
            "access_token": access_token,
            "token_type": "bearer",
        }

    finally:
        db.close()

#세션용 토큰 유지

@app.post("/api:8000/request_refresh")
def request_refresh(authorization: str | None = Header(None)):
    token = get_token_from_header(authorization)
    payload = verify_access_token(token)

    new_access_token = create_access_token(
        {
            "user_id": payload.get("user_id"),
            "nickname": payload.get("nickname"),
        }
    )

    return {
        "success": True,
        "message": "토큰 갱신 성공",
        "access_token": new_access_token,
        "token_type": "bearer",
    }


#토큰 만료 및 유지 기능 로그아웃

@app.post("/api:8000/request_logout")
def request_logout(authorization: str | None = Header(None)):
    token = get_token_from_header(authorization)
    verify_access_token(token)

    expired_tokens.add(token)

    return {
        "success": True,
        "message": "로그아웃하셨습니다.",
    }




#새 프로젝트 생성
@app.post("/api:8000/request_project_create")
def request_project_create(payload: ProjectCreateRequest):
    db = SessionLocal()

    try:
        owner = crud.get_user_by_nickname(db, payload.owner_nickname)

        if not owner:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

        project = crud.create_project(
            db=db,
            project_name=payload.project_name,
            owner_id=owner.id,
        )

        crud.add_project_member(
            db=db,
            project_id=project.id,
            user_id=owner.id,
            role="owner",
        )

        crud.create_project_log(
            db=db,
            project_id=project.id,
            nickname=owner.nickname,
            action="PROJECT_CREATE",
            message=f"{owner.nickname}님이 프로젝트를 생성했습니다.",
        )

        return {
            "success": True,
            "message": "프로젝트 생성 완료",
            "project": {
                "project_id": project.id,
                "project_name": project.project_name,
                "owner_nickname": owner.nickname,
            },
        }

    finally:
        db.close()


#사용자 참여 API불러오기
@app.post("/api:8000/request_project_list")
def request_project_list(payload: ProjectListRequest):
    db = SessionLocal()

    try:
        user = crud.get_user_by_nickname(db, payload.nickname)

        if not user:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

        projects = crud.get_projects_by_user_id(db, user.id)

        return {
            "success": True,
            "message": "프로젝트 목록 조회 성공",
            "projects": [
                {
                    "project_id": project.id,
                    "project_name": project.project_name,
                    "owner_id": project.owner_id,
                }
                for project in projects
            ],
        }

    finally:
        db.close()

#프로젝트 오픈
@app.post("/api:8000/request_project_open")
def request_project_open(payload: ProjectOpenRequest):
    db = SessionLocal()

    try:
        user = crud.get_user_by_nickname(db, payload.nickname)

        if not user:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

        is_member = crud.check_project_member(
            db=db,
            project_id=payload.project_id,
            user_id=user.id,
        )

        if not is_member:
            raise HTTPException(status_code=403, detail="프로젝트 접근 권한이 없습니다.")

        project = crud.get_project_by_id(db, payload.project_id)

        if not project:
            raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

        file_tree = crud.get_project_file_tree(db, payload.project_id)
        logs = crud.get_project_logs(db, payload.project_id)

        return {
            "success": True,
            "message": "프로젝트 열기 성공",
            "project": {
                "project_id": project.id,
                "project_name": project.project_name,
            },
            "file_tree": file_tree,
            "logs": logs,
            "editing_users": [],
        }

    finally:
        db.close()


#토큰 만료 및 유지 기능
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()