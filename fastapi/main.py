# 여기서 api 엔드포인트 생성 및 요청 처리하는 코드 작성
# db_manager/crud 이용해서 데이터를 가져오거나 저장하는 작업도 여기서 처리
# 비동기로 작성해야 요청을 효율적으로 처리할 수 있습니다. (async def, await 등 사용)

<<<<<<< HEAD
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from db_manager import crud, schemas
from db_manager.db_handler import SessionLocal
import my_token as token_module
=======
from fastapi import FastAPI, HTTPException
from typing import Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager
>>>>>>> connection_2

import os
import uuid
import httpx
<<<<<<< HEAD

SECRET_KEY = os.getenv("SECRET_KEY", "temporary-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

oauth2scheme = OAuth2PasswordBearer(tokenUrl="request_login")

app = FastAPI(title="InsideViral API")

#현재 수정중인 사용자 추적용 메모리
#{ file_uid: { nickname: last_seen_datetime_utc } }
editing_users = {}
EDITING_TTL_SECONDS = 30

def cleanup_editing_users():
    """Remove stale editor entries based on heartbeat timeout."""
    now = datetime.now(timezone.utc)
    expired_file_ids = []

    for file_uid, user_map in editing_users.items():
        expired_nicknames = [
            nickname
            for nickname, last_seen in user_map.items()
            if (now - last_seen).total_seconds() > EDITING_TTL_SECONDS
        ]

        for nickname in expired_nicknames:
            del user_map[nickname]

        if not user_map:
            expired_file_ids.append(file_uid)

    for file_uid in expired_file_ids:
        del editing_users[file_uid]


def get_active_editors(file_uid: str):
    """Return current active nicknames for the file."""
    return list(editing_users.get(file_uid, {}).keys())


def touch_editing_user(file_uid: str, nickname: str):
    """Register or refresh a file editor heartbeat."""
    file_users = editing_users.setdefault(file_uid, {})
    file_users[nickname] = datetime.now(timezone.utc)


def release_editing_user(file_uid: str, nickname: str):
    """Explicitly remove a file editor, if present."""
    file_users = editing_users.get(file_uid)
    if not file_users:
        return

    file_users.pop(nickname, None)
    if not file_users:
        editing_users.pop(file_uid, None)


def has_other_active_editor(file_uid: str, nickname: str):
    """Check whether another user is actively editing the file."""
    file_users = editing_users.get(file_uid, {})
    return any(nick != nickname for nick in file_users.keys())


#회원가입 아이디 중복 체크
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

#회원가입 닉네임 중복 체크
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

#회원가입 요청 받기
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
                "nickname": None
            }

        if user.password != payload.password:
            return {
                "success": False,
                "message": "비밀번호가 일치하지 않습니다.",
                "access_token": None,
                "token_type": None,
                "nickname": None
            }

        access_token = token_module.create_access_token({"id": user.id, "nickname": user.nickname})
        return {
            "success": True,
            "message": "로그인하셨습니다.",           
            "access_token": access_token,
            "token_type": "bearer",
            "nickname": user.nickname
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

#프로젝트 열기
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

#파일 생성
@app.post("/api:8000/request_file_create")
def request_file_create(payload: schemas.RequestFileCreate, authorization: str | None = Header(None)):
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

        # user_uploads 폴더에 데이터 파일 생성

        new_file = crud.create_file_node(
            db=db,
            project_id=payload.project_id,
            name=payload.file_name,
            node_type=crud.models.NodeType.FILE,
            parent_id=payload.parent_node_id,
        )

        crud.create_project_log(
            db=db,
            project_id=payload.project_id,
            nickname=user.nickname,
            action="FILE_CREATE",
            message=f"{user.nickname}님이 파일 '{new_file.display_name}'을 생성했습니다.",
            target_node_id=new_file.uid
        )

        return {
            "success": True,
            "message": "파일 생성 성공",
            "file": {
                "file_id": new_file.uid,
                "file_name": new_file.display_name,
                "parent_node_id": new_file.parent_uid,
                "node_type": new_file.node_type.value if hasattr(new_file.node_type, "value") else str(new_file.node_type),
                "file_path": new_file.file_path,
            },
        }

    finally:
        db.close()

#디렉토리 생성
@app.post("/api:8000/request_directory_create")
def request_directory_create(payload: schemas.RequestDirectoryCreate, authorization: str | None = Header(None)):
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

        new_directory = crud.create_file_node(
            db=db,
            project_id=payload.project_id,
            name=payload.directory_name,
            node_type=crud.models.NodeType.DIRECTORY,
            parent_id=payload.parent_node_id,
        )

        crud.create_project_log(
            db=db,
            project_id=payload.project_id,
            nickname=user.nickname,
            action="DIRECTORY_CREATE",
            message=f"{user.nickname}님이 디렉토리 '{new_directory.display_name}'을 생성했습니다.",
            target_node_id=new_directory.uid
        )

        return {
            "success": True,
            "message": "디렉토리 생성 성공",
            "directory": {
                "directory_id": new_directory.uid,
                "directory_name": new_directory.display_name,
                "parent_node_id": new_directory.parent_uid,
                "node_type": new_directory.node_type.value if hasattr(new_directory.node_type, "value") else str(new_directory.node_type),
                "file_path": new_directory.file_path,
            },
        }
    finally:
        db.close()
    
#파일 열기
@app.post("/api:8000/request_file_open")
def request_file_open(payload: schemas.RequestFileOpen, authorization: str | None = Header(None)):
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

        file_node = crud.get_file_node(db, payload.file_uid)

        if not file_node or file_node.node_type != crud.models.NodeType.FILE:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

        if has_other_active_editor(file_node.uid, user.nickname):
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "다른 사용자가 수정 중입니다.",
                    "editing_users": get_active_editors(file_node.uid),
                },
            )

        touch_editing_user(file_node.uid, user.nickname)

        file_content = crud.read_file_content(db, file_node.uid)

        return {
            "success": True,
            "message": "파일 열기 성공",
            "file": {
                "file_id": file_node.uid,
                "file_name": file_node.display_name,
                "parent_node_id": file_node.parent_uid,
                "node_type": file_node.node_type.value if hasattr(file_node.node_type, "value") else str(file_node.node_type),
                "file_path": file_node.file_path,
                "content": file_content,
            },
            "editing_users": get_active_editors(file_node.uid),
        }

    finally:
        db.close()


#파일 편집 하트비트 갱신(프론트에서 10초마다 갱신 필요)
@app.post("/api:8000/request_file_heartbeat")
def request_file_heartbeat(payload: schemas.RequestFileAction, authorization: str | None = Header(None)):
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

        file_node = crud.get_file_node(db, payload.file_uid)

        if not file_node or file_node.node_type != crud.models.NodeType.FILE:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

        cleanup_editing_users()  # 주기적으로 한 번만 정리 (heartbeat에서만)
        touch_editing_user(file_node.uid, user.nickname)

        return {
            "success": True,
            "message": "하트비트 갱신 성공",
            "editing_users": get_active_editors(file_node.uid),
        }

    finally:
        db.close()

#파일 편집 종료(명시적 해제)
@app.post("/api:8000/request_file_release")
def request_file_release(payload: schemas.RequestFileAction, authorization: str | None = Header(None)):
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

        file_node = crud.get_file_node(db, payload.file_uid)

        if not file_node or file_node.node_type != crud.models.NodeType.FILE:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

        release_editing_user(file_node.uid, user.nickname)

        return {
            "success": True,
            "message": "편집 상태 해제 성공",
            "editing_users": get_active_editors(file_node.uid),
        }

    finally:
        db.close()

#파일 저장
@app.post("/api:8000/request_file_save")
def request_file_save(payload: schemas.RequestFileSave, authorization: str | None = Header(None)):
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

        file_node = crud.get_file_node(db, payload.file_uid)

        if not file_node or file_node.node_type != crud.models.NodeType.FILE:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

        is_saved = crud.save_file_content(db, file_node.uid, payload.content)

        if not is_saved:
            raise HTTPException(status_code=500, detail="파일 저장에 실패했습니다.")

        crud.create_project_log(
            db=db,
            project_id=payload.project_id,
            nickname=user.nickname,
            action="FILE_SAVE",
            message=f"{user.nickname}님이 파일 '{file_node.display_name}'을 저장했습니다.",
            target_node_id=file_node.uid
        )

        return {
            "success": True,
            "message": "파일 저장 성공",
        }

    finally:
        db.close()

#디스플레이 이름 변경 (파일/디렉토리 공통)
@app.post("/api:8000/request_node_rename")
def request_node_rename(payload: schemas.RequestNodeRename, authorization: str | None = Header(None)):
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

        node = crud.get_file_node(db, payload.node_id)

        if not node:
            raise HTTPException(status_code=404, detail="노드를 찾을 수 없습니다.")

        crud.rename_node(db, node.uid, payload.new_name)

        crud.create_project_log(
            db=db,
            project_id=payload.project_id,
            nickname=user.nickname,
            action="NODE_RENAME",
            message=f"{user.nickname}님이 노드 '{node.display_name}'의 이름을 '{payload.new_name}'으로 변경했습니다.",
            target_node_id=node.uid
        )

        return {
            "success": True,
            "message": "노드 이름 변경 성공",
        }

    finally:
        db.close()

#프로젝트 이름 변경( = 루트 디렉토리 이름 변경)
@app.post("/api:8000/request_project_rename")
def request_project_rename(payload: schemas.RequestProjectRename, authorization: str | None = Header(None)):
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

        crud.rename_project(db, project, payload.new_name)

        crud.create_project_log(
            db=db,
            project_id=project.uid,
            nickname=user.nickname,
            action="PROJECT_RENAME",
            message=f"{user.nickname}님이 프로젝트 이름을 '{project.name}'에서 '{payload.new_name}'으로 변경했습니다.",
        )

        return {
            "success": True,
            "message": "프로젝트 이름 변경 성공",
        }

    finally:
        db.close()

#프로젝트에 사용자 초대
@app.post("/api:8000/request_project_invite")
def request_project_invite(payload: schemas.RequestProjectInvite, authorization: str | None = Header(None)):
    token_str = token_module.get_token_from_header(authorization)
    token_payload = token_module.verify_access_token(token_str)
    token_user_id = token_payload.get("id")

    db = SessionLocal()

    try:
        inviter = crud.get_user_by_user_id(db, token_user_id)

        if not inviter:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

        is_member = crud.check_project_member(
            db=db,
            project_id=payload.project_id,
            user_id=inviter.id,
        )
        if not is_member:
            raise HTTPException(status_code=403, detail="프로젝트 접근 권한이 없습니다.")

        target_user = crud.get_user_by_nickname(db, payload.target_nickname)

        if not target_user:
            raise HTTPException(status_code=404, detail="초대할 사용자를 찾을 수 없습니다.")

        project = crud.get_project_by_id(db, payload.project_id)

        if not project:
            raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

        if target_user.id == project.creator_id:
            raise HTTPException(status_code=400, detail="프로젝트 생성자는 이미 프로젝트에 속해 있습니다.")

        existing_membership = crud.check_project_member(db, payload.project_id, target_user.id)
        if existing_membership:
            raise HTTPException(status_code=400, detail="사용자는 이미 프로젝트에 속해 있습니다.")

        crud.add_project_member(db, payload.project_id, target_user.id)

        crud.create_project_log(
            db=db,
            project_id=project.uid,
            nickname=inviter.nickname,
            action="PROJECT_INVITE",
            message=f"{inviter.nickname}님이 {target_user.nickname}님을 프로젝트에 초대했습니다.",
        )

        return {
            "success": True,
            "message": f"{target_user.nickname}님이 프로젝트에 초대되었습니다.",
        }

    finally:
        db.close()

#프로젝트 멤버 추방
@app.post("/api:8000/request_project_remove_member")
def request_project_remove_member(payload: schemas.RequestProjectRemoveMember, authorization: str | None = Header(None)):
    token_str = token_module.get_token_from_header(authorization)
    token_payload = token_module.verify_access_token(token_str)
    token_user_id = token_payload.get("id")

    db = SessionLocal()

    try:
        requester = crud.get_user_by_user_id(db, token_user_id)

        if not requester:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

        is_member = crud.check_project_member(
            db=db,
            project_id=payload.project_id,
            user_id=requester.id,
        )
        if not is_member:
            raise HTTPException(status_code=403, detail="프로젝트 접근 권한이 없습니다.")

        target_user = crud.get_user_by_nickname(db, payload.target_nickname)

        if not target_user:
            raise HTTPException(status_code=404, detail="추방할 사용자를 찾을 수 없습니다.")

        project = crud.get_project_by_id(db, payload.project_id)

        if not project:
            raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

        if target_user.id == project.creator_id:
            raise HTTPException(status_code=400, detail="프로젝트 생성자는 프로젝트에서 추방할 수 없습니다.")

        existing_membership = crud.check_project_member(db, payload.project_id, target_user.id)
        if not existing_membership:
            raise HTTPException(status_code=400, detail="사용자는 프로젝트에 속해 있지 않습니다.")

        crud.remove_project_member(db, payload.project_id, target_user.id)

        crud.create_project_log(
            db=db,
            project_id=project.uid,
            nickname=requester.nickname,
            action="PROJECT_REMOVE_MEMBER",
            message=f"{requester.nickname}님이 {target_user.nickname}님을 프로젝트에서 추방했습니다.",
        )

        return {
            "success": True,
            "message": f"{target_user.nickname}님이 프로젝트에서 추방되었습니다.",
        }

    finally:
        db.close()

#프로젝트 멤버 목록 조회 및 수정 중인 사용자 정보 반영
@app.post("/api:8000/request_project_members")
def request_project_members(payload: schemas.RequestProjectMembers, authorization: str | None = Header(None)):
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

        members = crud.get_project_members(db, payload.project_id)

        # 편집 중인 사용자 정보 정리 (조회 시에만)
        cleanup_editing_users()

        return {
            "success": True,
            "message": "프로젝트 멤버 목록 조회 성공",
            "members": [
                {
                    "user_id": member.user.id,
                    "nickname": member.user.nickname,
                    "is_creator": member.user.id == crud.get_project_by_id(db, payload.project_id).creator_id,
                    "is_editing": any(
                        member.user.nickname in editors for editors in editing_users.values()
                    ),
                }
                for member in members
            ],
        }

    finally:
        db.close()

#프로젝트 삭제
@app.post("/api:8000/request_project_delete")
def request_project_delete(payload: schemas.RequestProjectOpen, authorization: str | None = Header(None)):
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

        if project.creator_id != user.id:
            raise HTTPException(status_code=403, detail="프로젝트 삭제는 생성자만 가능합니다.")

        cleanup_editing_users()  # 삭제 시에만 정리
        nodes = crud.get_project_nodes(db, payload.project_id)
        for node in nodes:
            if node.uid in editing_users:
                return {
                    "success": False,
                    "message": "해당 프로젝트에서 편집 중인 사용자가 존재합니다. 모든 사용자가 편집을 종료한 후 다시 시도해주세요.",
                }

        # 프로젝트에 속한 모든 데이터 파일 삭제
        for node in nodes:
            if node.node_type == crud.models.NodeType.FILE:
                crud.delete_file_data(node.file_path)

        crud.delete_project(db, project)

        return {
            "success": True,
            "message": "프로젝트가 삭제되었습니다.",
        }

    finally:
        db.close()

#파일 삭제
@app.post("/api:8000/request_file_delete")
def request_file_delete(payload: schemas.RequestFileDelete, authorization: str | None = Header(None)):
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

        node = crud.get_file_node(db, payload.file_uid)

        if not node:
            raise HTTPException(status_code=404, detail="노드를 찾을 수 없습니다.")

        if node.node_type == crud.models.NodeType.FILE:
            cleanup_editing_users()  # 삭제 시에만 정리
            if has_other_active_editor(node.uid, user.nickname):
                return{
                    "success": False,
                    "message": "해당 파일에서 다른 사용자가 수정 중입니다. 모든 사용자가 편집을 종료한 후 다시 시도해주세요.",
                    "editing_users": get_active_editors(node.uid),
                }

        crud.delete_file_data(node.file_path)
        crud.delete_node(db, node)

        crud.create_project_log(
            db=db,
            project_id=payload.project_id,
            nickname=user.nickname,
            action="NODE_DELETE",
            message=f"{user.nickname}님이 파일 '{node.display_name}'을 삭제했습니다.",
            target_node_id=node.uid
        )

        return {
            "success": True,
            "message": "파일이 삭제되었습니다.",
        }

    finally:
        db.close()

#디렉토리 삭제
@app.post("/api:8000/request_directory_delete")
def request_directory_delete(payload: schemas.RequestDirectoryDelete, authorization: str | None = Header(None)):
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

        node = crud.get_file_node(db, payload.node_uid)

        if not node:
            raise HTTPException(status_code=404, detail="노드를 찾을 수 없습니다.")

        if node.node_type != crud.models.NodeType.DIRECTORY:
            raise HTTPException(status_code=400, detail="노드가 디렉토리가 아닙니다.")

        # 디렉토리 내 모든 파일에 대해 편집 중인 사용자가 있는지 확인
        descendant_file_nodes = crud.get_descendant_file_nodes(db, node.uid)
        cleanup_editing_users()  # 삭제 시에만 정리
        for file in descendant_file_nodes:
            if has_other_active_editor(file.uid, user.nickname):
                return {
                    "success": False,
                    "message": f"디렉토리 내 파일 '{file.display_name}'에서 다른 사용자가 수정 중입니다. 모든 사용자가 편집을 종료한 후 다시 시도해주세요.",
                    "editing_users": get_active_editors(file.uid),
                }

        for file in descendant_file_nodes:
            crud.delete_file_data(file.file_path)
        crud.delete_node(db, node)

        crud.create_project_log(
            db=db,
            project_id=payload.project_id,
            nickname=user.nickname,
            action="NODE_DELETE",
            message=f"{user.nickname}님이 디렉토리 '{node.display_name}'을 삭제했습니다.",
            target_node_id=node.uid
        )

        return {
            "success": True,
            "message": "디렉토리가 삭제되었습니다.",
        }

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
>>>>>>> connection_2
