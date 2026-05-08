# schemas.py

from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from DB_manager.models import RequestStatus


class CrawlRelayRequest(BaseModel):
    keyword: str
    max_count: Optional[int] = 10


class CrawlerCallbackPayload(BaseModel):
    request_id: str
    status: RequestStatus
    error_message: Optional[str] = None
    saved_rows: Optional[int] = None


class RequestLogUpsert(BaseModel):
    request_id: str
    status: RequestStatus
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    error_message: Optional[str] = None


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