# 여기서 api 엔드포인트 생성 및 요청 처리하는 코드 작성
# db_manager/crud 이용해서 데이터를 가져오거나 저장하는 작업도 여기서 처리
# 비동기로 작성해야 요청을 효율적으로 처리할 수 있습니다. (async def, await 등 사용)

from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from db_manager import crud, schemas
from db_manager.db_handler import SessionLocal
import token as token_module

import os
import uuid
import httpx

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
def request_id_check(payload: schemas.UserIdCheckRequest):
    db = SessionLocal()
    try:
        existing_user = crud.get_user_by_user_id(db, payload.user_id)
        if existing_user:
            return {"available": False}
        return {"available": True}
    finally:
        db.close()

@app.post("/api:8000/request_nickname_check")
def request_nickname_check(payload: schemas.NicknameCheckRequest):
    db = SessionLocal()
    try:
        existing_nickname = crud.get_user_by_nickname(db, payload.nickname)
        if existing_nickname:
            return {"available": False}
        return {"available": True}
    finally:
        db.close()

@app.post("/api:8000/request_register")
def request_register(payload: schemas.RequestRegister):
    db = SessionLocal()

    try:
        new_user = crud.create_user(
            db=db,
            user_id=payload.id,
            password=payload.password,
            nickname=payload.nick_name,
        )

        return {
            "success": True,
            "message": "회원가입에 성공하셨습니다.",
            "user": {
                "user_id": new_user.id,
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

        if user.password != payload.password:
            return {
                "success": False,
                "message": "비밀번호가 일치하지 않습니다.",
                "access_token": None,
                "token_type": None,
                "nickname": None,
            }

        access_token = token_module.create_access_token({"id": user.id, "nickname": user.nickname})

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

#프로젝트 목록 조회
@app.post("/api:8000/request_project_list")
def request_project_list(authorization: str | None = Header(None)):
    token_str = token_module.get_token_from_header(authorization)
    token_payload = token_module.verify_access_token(token_str)
    token_user_id = token_payload.get("id")
    token_nickname = token_payload.get("nickname")

    db = SessionLocal()
    try:
        user = crud.get_user_by_user_id(db, token_user_id)
        
        if not user:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

        projects = crud.get_projects_by_user_id(db, user.id)

        return {
            "success": True,
            "message": f"{token_nickname}님의 프로젝트 목록 조회 성공",
            "nickname": token_nickname,
            "user_id": token_user_id,
            "projects": [
                {
                    "project_id": project.uid,
                    "project_name": project.name,
                    "owner_nickname": project.creator.nickname,
                    "invited_users_nickname": [member.user.nickname for member in project.members if member.user_id != project.creator_id],
                }
                for project in projects
            ],
        }

    finally:
        db.close()

#새 프로젝트 생성
@app.post("/api:8000/request_project_create")
def request_project_create(payload: schemas.RequestProjectCreate, authorization: str | None = Header(None)):
    token_str = token_module.get_token_from_header(authorization)
    token_payload = token_module.verify_access_token(token_str)

    db = SessionLocal()
    try:
        owner = crud.get_user_by_user_id(db, token_payload.get("id"))

        if not owner:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

        project = crud.create_project(
            db=db,
            project_name=payload.project_name,
            creator_id=owner.id,
        )


        crud.create_project_log(
            db=db,
            project_id=project.uid,
            nickname=owner.nickname,
            action="PROJECT_CREATE",
            message=f"{owner.nickname}님이 프로젝트를 생성했습니다.",
        )

        return {
            "success": True,
            "message": "프로젝트 생성 완료",
            "project": {
                "project_id": project.uid,
                "project_name": project.name,
                "owner_nickname": token_payload.get("nickname"),
            },
        }

    finally:
        db.close()

#프로젝트 오픈
@app.post("/api:8000/request_project_open")
def request_project_open(payload: schemas.RequestProjectOpen, authorization: str | None = Header(None)):
    token_str = token_module.get_token_from_header(authorization)
    token_payload = token_module.verify_access_token(token_str)
    token_user_id = token_payload.get("id")

    db = SessionLocal()

    try:
        user = crud.get_user_by_user_id(db, token_user_id)

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

        # 프로젝트에 속하는 모든 파일노드를 트리 구조로 반환 (왼쪽 폴더 패널용)
        file_tree = crud.get_project_file_tree(db, payload.project_id)

        raw_logs = crud.get_project_logs(db, payload.project_id)
        logs = []

        for log in raw_logs:
            raw_node = crud.get_file_node(db, log.target_node_uid) if log.target_node_uid else None
            logs.append({
                "log_id": str(log.uid),
                "user_nickname": log.user.nickname if log.user else "알 수 없음",
                "action_type": log.action_type,
                "message": log.message,
                "timestamp": log.created_at.isoformat(),
                "target_node_name": raw_node.display_name if raw_node else None,
            })


        return {
            "success": True,
            "message": "프로젝트 열기 성공",
            "project": {
                "project_id": project.uid,
                "project_name": project.name,
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
