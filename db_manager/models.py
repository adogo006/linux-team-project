# 테이블로 만들 db 모델 정의

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import datetime
import enum
import uuid


# database.py에서 Base 객체를 가져옴
from .db_handler import Base

KST = datetime.timezone(datetime.timedelta(hours=9))


def now_kst():
    return datetime.datetime.now(KST)

# ==========================================
# 0. 공통 함수 & Enum
# ==========================================
def generate_uuid():
    return str(uuid.uuid4())

class NodeType(str, enum.Enum):
    FILE = "file"
    DIRECTORY = "directory"

# ==========================================
# 1. 계정 정보 (users)P
# ==========================================
class User(Base):
    __tablename__ = "users"

    # schemas.py의 id(아이디)와 혼동을 피하기 위해 uid로 사용하거나,
    # DB 고유 ID 자체를 문자열 UUID로 사용.
    uid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True) # DB 고유 ID
    id = Column(String(20), unique=True, index=True, nullable=False) # 로그인 아이디 (schemas.RequestRegister.id)
    password = Column(String, nullable=False)
    nickname = Column(String(12), unique=True, index=True, nullable=False) # 닉네임 (schemas.RequestRegister.nick_name)
    created_at = Column(DateTime(timezone=True), default=now_kst) # 계정 생성 시간

    # 역참조
    owned_projects = relationship("Project", back_populates="creator")
    memberships = relationship("ProjectMember", back_populates="user")
    logs = relationship("ProjectLog", back_populates="user")

# ==========================================
# 2. 프로젝트 정보 (projects)
# ==========================================
class Project(Base):
    __tablename__ = "projects"

    uid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True) # project_id
    name = Column(String(30), nullable=False)                                # project_name
    creator_id = Column(String, ForeignKey("users.id"), nullable=False)      # 생성자
    created_at = Column(DateTime(timezone=True), default=now_kst)              # 생성 시간

    # 역참조
    creator = relationship("User", back_populates="owned_projects")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")

    nodes = relationship("FileNode", back_populates="project", cascade="all, delete-orphan")
    logs = relationship("ProjectLog", back_populates="project", cascade="all, delete-orphan")

# ==========================================
# 3. 프로젝트 초대/권한 (project_members)
# ==========================================
class ProjectMember(Base):
    __tablename__ = "project_members"

    uid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_uid = Column(UUID(as_uuid=True), ForeignKey("projects.uid", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    joined_at = Column(DateTime(timezone=True), default=now_kst)

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="memberships")

# ==========================================
# 4. 파일/디렉토리 구조 (file_nodes)
# ==========================================
class FileNode(Base):
    __tablename__ = "file_nodes"

    uid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True) # file_id 또는 directory_id
    project_uid = Column(UUID(as_uuid=True), ForeignKey("projects.uid", ondelete="CASCADE"), nullable=False)
    parent_uid = Column(UUID(as_uuid=True), ForeignKey("file_nodes.uid", ondelete="CASCADE"), nullable=True, index=True) # 상위 폴더

    display_name = Column(String, nullable=False)
    node_type = Column(Enum(NodeType), nullable=False) # file or directory
    file_path = Column(String, nullable=True) # 파일 경로 (인덱스 포인터)

    created_at = Column(DateTime(timezone=True), default=now_kst)
    updated_at = Column(DateTime(timezone=True), default=now_kst, onupdate=now_kst)

    project = relationship("Project", back_populates="nodes")
    parent = relationship("FileNode", remote_side=[uid], back_populates="children")
    children = relationship(
        "FileNode",
        back_populates="parent",
        cascade="all, delete-orphan",
        single_parent=True,
    )

# ==========================================
# 5. 수정 히스토리/로그 (project_logs)
# ==========================================
class ProjectLog(Base):
    __tablename__ = "project_logs"

    uid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True) # log_id
    project_uid = Column(UUID(as_uuid=True), ForeignKey("projects.uid", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # 파일이나 디렉토리에 대한 로그 (schemas.LogModel 참고)
    target_node_uid = Column(UUID(as_uuid=True), ForeignKey("file_nodes.uid", ondelete="SET NULL"), nullable=True) 
    
    action_type = Column(String, nullable=False)                  # 생성, 수정, 삭제 등
    message = Column(Text, nullable=False)                        # log_message
    
    start_time = Column(DateTime(timezone=True), nullable=True)                  # 수정 시작 시간
    end_time = Column(DateTime(timezone=True), default=now_kst) # 수정 완료 시간

    project = relationship("Project", back_populates="logs")
    user = relationship("User", back_populates="logs")

# ==========================================
# 6. 초대 요청 (invites_requests)
# ==========================================
class InviteRequest(Base):
    __tablename__ = "invite_requests"

    uid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True) # invite_id
    project_uid = Column(UUID(as_uuid=True), ForeignKey("projects.uid", ondelete="CASCADE"), nullable=False)
    inviter_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True) # 초대한 사람
    invitee_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True) # 초대받는 사람

    created_at = Column(DateTime(timezone=True), default=now_kst)

    project = relationship("Project")
    inviter = relationship("User", foreign_keys=[inviter_id])
    invitee = relationship("User", foreign_keys=[invitee_id])