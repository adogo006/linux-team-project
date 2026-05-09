# 여기서 api 엔드포인트 생성 및 요청 처리하는 코드 작성
# db_manager/crud 이용해서 데이터를 가져오거나 저장하는 작업도 여기서 처리
# 비동기로 작성해야 요청을 효율적으로 처리할 수 있습니다. (async def, await 등 사용)

<<<<<<< HEAD
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from jose import jwt, JWTError
from db_manager import crud, schemas
from db_manager.db_handler import SessionLocal
import token as token_module
=======
from fastapi import FastAPI, HTTPException
from typing import Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager
>>>>>>> feature/db-setup

import os
import uuid
import httpx
<<<<<<< HEAD
from schemas import  RequestLogUpsert, RegisterRequest, LoginRequest, ProjectCreateRequest, ProjectListRequest, ProjectOpenRequest

SECRET_KEY = os.getenv("SECRET_KEY", "temporary-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

oauth2scheme = OAuth2PasswordBearer(tokenUrl="request_login")

#############
#crud부르기
app = FastAPI(title="InsideViral API")

########################
##회원가입 등록 및 중복확인
@app.post("/api:8000/request_id_check")
def request_id_check(payload: schemas.RegisterRequest):
    db = SessionLocal()
    try:
        existing_user = crud.get_user_by_user_id(db, payload.user_id)
        if existing_user:
            return {"available": False}
        return {"available": True}
    finally:
        db.close()

@app.post("/api:8000/request_nickname_check")
def request_nickname_check(payload: schemas.RegisterRequest):
    db = SessionLocal()
    try:
        existing_nickname = crud.get_user_by_nickname(db, payload.nickname)
        if existing_nickname:
            return {"available": False}
        return {"available": True}
    finally:
        db.close()

@app.post("/api:8000/request_register")
def request_register(payload: schemas.RegisterRequest):
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

#로그인 요청 받기, ResponseLogin 모델로 응답하기, JWT 토큰 생성해서 반환하기
@app.post("/api:8000/request_login")
def request_login(payload: schemas.RequestLogin):
    db = SessionLocal()
    try:
        user = crud.get_user_by_user_id(db, payload.id)

        if not user:
            return {
                "success": False,
                "message": "존재하지 않는 아이디입니다.",
                "access_token": None,
                "token_type": None,
                "nickname": None,
            }

        if user.password_hash != payload.password:
            return {
                "success": False,
                "message": "비밀번호가 일치하지 않습니다.",
                "access_token": None,
                "token_type": None,
                "nickname": None,
            }

        access_token = token_module.create_access_token({"id" : user.username, "nickname": user.nickname})

        return {
            "success": True,
            "message": "로그인하셨습니다.",           
            "access_token": access_token,
            "token_type": "bearer",
            "nickname": user.nickname,
        }

    finally:
        db.close()

#세션용 토큰 유지
@app.post("/api:8000/request_refresh")
def request_refresh(authorization: str | None = Header(None)):
    token_str = token_module.get_token_from_header(authorization)
    payload = token_module.verify_access_token(token_str)

    new_access_token = token_module.create_access_token({
        "id": payload.get("id"),
        "nickname": payload.get("nickname"),
    })
  
    return {
        "success": True,
        "message": "토큰 갱신 성공",
        "access_token": new_access_token,
        "token_type": "bearer",
    }

#토큰 만료 및 유지 기능 로그아웃
@app.post("/api:8000/request_logout")
def request_logout(authorization: str | None = Header(None)):
    token_str = token_module.get_token_from_header(authorization)
    token_module.verify_access_token(token_str)
    token_module.add_expired_token(token_str)
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
=======
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
>>>>>>> feature/db-setup
