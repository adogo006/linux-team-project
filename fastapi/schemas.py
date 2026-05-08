from pydantic import BaseModel
from typing import Optional, List


class RegisterRequest(BaseModel):
    user_id: str
    password: str
    nickname: str


class LoginRequest(BaseModel):
    user_id: str
    password: str


class ProjectCreateRequest(BaseModel):
    project_name: str
    owner_nickname: str


class ProjectListRequest(BaseModel):
    nickname: str


class ProjectOpenRequest(BaseModel):
    project_id: int
    nickname: str