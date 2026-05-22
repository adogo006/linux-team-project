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

# ==========================================
# 2. 프로젝트 관리 스키마
# ==========================================

class RequestProjectCreate(BaseModel):
    project_name: str = Field(..., min_length=2, max_length=30, description="프로젝트 이름")

class RequestProjectInvite(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    target_nickname: str = Field(..., description="초대할 대상 닉네임")

class RequestProjectRemoveMember(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    target_nickname: str = Field(..., description="제거할 대상 닉네임")

class RequestProjectMembers(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")

class RequestProjectOpen(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")

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

class RequestFileDelete(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    file_uid: str = Field(..., description="파일 고유 ID")

class RequestDirectoryDelete(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    node_uid: str = Field(..., description="디렉토리 고유 ID")

class RequestFileSave(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    file_uid: str = Field(..., description="파일 고유 ID")
    content: str = Field(..., description="저장할 파일 내용")

class RequestNodeRename(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    node_id: str = Field(..., description="파일 또는 디렉토리 고유 ID")
    new_name: str = Field(..., min_length=1, max_length=100, description="새 이름")

class RequestProjectRename(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    new_name: str = Field(..., min_length=2, max_length=30, description="새 프로젝트 이름")

class RequestFileAction(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    file_uid: str = Field(..., description="파일 고유 ID")

# 아이디 중복 체크 요청 모델
class UserIdCheckRequest(BaseModel):
    user_id: str = Field(..., min_length=4, max_length=20)

class NicknameCheckRequest(BaseModel):
    nickname: str = Field(..., min_length=2, max_length=12)

class RequestInviteRespond(BaseModel):
    project_id: str = Field(..., description="프로젝트 고유 ID")
    action: Literal["ACCEPT", "REJECT"] = Field(..., description="초대 수락 여부 (ACCEPT 또는 REJECT)")