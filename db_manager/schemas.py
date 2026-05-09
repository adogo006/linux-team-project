from __future__ import annotations
from datetime import datetime
from typing import Literal, Optional, List
from pydantic import BaseModel, Field


# ==========================================
# 1. 계정 정보 관리 스키마
# ==========================================

class RequestRegister(BaseModel):
    id: str = Field(..., min_length=4, max_length=20, description="사용자 아이디 (4~20자)")
    password: str = Field(..., min_length=8, description="사용자 비밀번호 (최소 8자)")
    nick_name: str = Field(..., min_length=2, max_length=12, description="사용자 닉네임 (2~12자)")

class RequestLogin(BaseModel):
    id: str = Field(..., description="사용자 아이디")
    password: str = Field(..., description="사용자 비밀번호")

class ResponseLogin(BaseModel):
    success: bool = Field(..., description="로그인 성공 여부")
    message: str = Field(..., description="로그인 결과 메시지")
    access_token: str = Field(..., description="JWT 액세스 토큰")
    token_type: str = Field("bearer", description="토큰 타입")
    nick_name: str = Field(..., description="사용자 닉네임")

# ==========================================
# 2. 프로젝트 관리 스키마
# ==========================================

class RequestProjectCreate(BaseModel):
    project_name: str = Field(..., min_length=2, max_length=30, description="프로젝트 이름")

class RequestProjectRemove(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    requester_nickname: str = Field(..., description="삭제 요청자 닉네임")

class RequestProjectInvite(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    inviter_nickname: str = Field(..., description="초대자(생성자/권한자) 닉네임")
    target_nickname: str = Field(..., description="초대할 대상 닉네임")

class RequestProjectOpen(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")

class DirectoryNode(BaseModel):
    name: str
    node_type: str
    path: Optional[str] = None
    children: List[DirectoryNode] = Field(default_factory=list)

class ResponseProjectOpen(BaseModel):
    project_id: str
    project_name: str
    root_directory: DirectoryNode = Field(..., description="루트 디렉토리 구조")

class ProjectModel(BaseModel):
    project_id: str
    project_name: str
    creator: str
    invited_users: List[str]

# ==========================================
# 3. 파일 및 디렉토리 관리 스키마
# ==========================================

class RequestFileCreate(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    file_name: str = Field(..., min_length=1, max_length=100, description="파일 이름")
    parent_node_id: str = Field(..., description="부모 노드 ID")

class RequestFileOpen(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    file_uid: str = Field(..., description="파일 고유 ID")

class RequestDirectoryCreate(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    directory_name: str = Field(..., min_length=1, max_length=100, description="디렉토리 이름")
    parent_node_id: Optional[str] = Field(None, description="부모 노드 ID (루트 디렉토리인 경우 None)")

class RequestFileSave(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    file_uid: str = Field(..., description="파일 고유 ID")
    content: str = Field(..., description="저장할 파일 내용")
    user_nickname: str = Field(..., description="저장하는 사용자 닉네임")

class RequestFileAction(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    file_uid: str = Field(..., description="파일 고유 ID")
    user_nickname: str = Field(..., description="요청하는 사용자 닉네임")

class RequestFileRename(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    old_path: str = Field(..., description="기존 파일 경로")
    new_path: str = Field(..., description="새로운 파일 경로")
    user_nickname: str = Field(..., description="요청하는 사용자 닉네임")

# 디렉토리 관련 스키마
class RequestDirectoryAction(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    dir_path: str = Field(..., description="디렉토리 경로")
    user_nickname: str = Field(..., description="요청하는 사용자 닉네임")

class RequestDirectoryRename(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    old_path: str = Field(..., description="기존 디렉토리 경로")
    new_path: str = Field(..., description="새로운 디렉토리 경로")
    user_nickname: str = Field(..., description="요청하는 사용자 닉네임")


# ==========================================
# 4. 로그(히스토리) 관리 스키마
# ==========================================

class RequestSaveLog(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    file_id: Optional[str] = Field(None, description="파일 고유 ID (해당 작업이 파일 관련인 경우)")
    directory_id: Optional[str] = Field(None, description="디렉토리 고유 ID (해당 작업이 디렉토리 관련인 경우)")
    log_message: str = Field(..., description="로그 메시지")
    user_nickname: str = Field(..., description="작업자 닉네임")

class LogModel(BaseModel):
    log_id: str
    project_id: str
    file_id : Optional[str] = None
    directory_id : Optional[str] = None
    nickname: str
    start_time: str
    end_time: str
    message: str

class ResponseLogList(BaseModel):
    logs: List[LogModel]

# 아이디 중복 체크 요청 모델
class UserIdCheckRequest(BaseModel):
    user_id: str = Field(..., min_length=4, max_length=20)

class NicknameCheckRequest(BaseModel):
    nickname: str = Field(..., min_length=2, max_length=12)