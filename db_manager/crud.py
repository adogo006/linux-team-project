# db 안 데이터를 조작하는 함수 모듈
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from . import models

# ==========================================
# 1. 사용자 (User) 관련 함수
# ==========================================

def get_user_by_username(db: Session, username: str):
    """로그인 및 중복 체크 시 아이디로 유저 조회"""
    return db.query(models.User).filter(models.User.username == username).first()

def get_user_by_nickname(db: Session, nickname: str):
    """닉네임 중복 체크 시 조회"""
    return db.query(models.User).filter(models.User.nickname == nickname).first()

def create_user(db: Session, username: str, password_hash: str, nickname: str):
    """회원가입 기능 (새 계정 생성)"""
    db_user = models.User(
        username=username, 
        password_hash=password_hash, 
        nickname=nickname
    )
    db.add(db_user)
    try:
        db.commit()
        db.refresh(db_user)
        return db_user
    except IntegrityError:
        db.rollback()
        return None # 중복 에러 발생 시 None 반환

# ==========================================
# 2. 프로젝트 (Project) 관련 함수
# ==========================================

def create_project(db: Session, project_name: str, creator_id: str):
    """프로젝트 생성 및 생성자를 owner 권한으로 멤버에 자동 추가"""
    # 1. 프로젝트 생성
    db_project = models.Project(name=project_name, creator_id=creator_id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)

    # 2. 생성자를 프로젝트 멤버(owner)로 즉시 등록
    db_member = models.ProjectMember(
        project_id=db_project.id, 
        user_id=creator_id, 
        role="owner"
    )
    db.add(db_member)
    db.commit()
    
    return db_project

def get_project_list_by_user(db: Session, user_id: str):
    """특정 유저가 속해있는(수정 가능한) 프로젝트 목록 반환"""
    # ProjectMember 테이블을 조인해서 해당 유저가 포함된 프로젝트만 가져옴
    return db.query(models.Project).join(models.ProjectMember).filter(
        models.ProjectMember.user_id == user_id
    ).all()

def delete_project(db: Session, project_id: str, requester_id: str):
    """프로젝트 삭제 (요청자가 owner인지 확인 후 삭제)"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    
    if project and project.creator_id == requester_id:
        db.delete(project)
        db.commit()
        return True
    return False

def invite_user_to_project(db: Session, project_id: str, target_user_id: str, role: str = "member"):
    """프로젝트 초대 기능"""
    # 이미 멤버인지 확인
    existing_member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == target_user_id
    ).first()
    
    if existing_member:
        return None # 이미 초대됨

    db_member = models.ProjectMember(project_id=project_id, user_id=target_user_id, role=role)
    db.add(db_member)
    db.commit()
    return db_member

# ==========================================
# 3. 파일 및 폴더 (FileNode) 관련 함수
# ==========================================

def create_file_node(db: Session, project_id: str, name: str, node_type: models.NodeType, parent_id: str = None, content: str = None):
    """파일 또는 디렉토리 생성"""
    db_node = models.FileNode(
        project_id=project_id,
        name=name,
        node_type=node_type,
        parent_id=parent_id,
        content=content if node_type == models.NodeType.FILE else None
    )
    db.add(db_node)
    db.commit()
    db.refresh(db_node)
    return db_node

def get_project_nodes(db: Session, project_id: str):
    """프로젝트 내의 모든 파일/폴더 구조 가져오기 (프로젝트 Open 시 사용)"""
    return db.query(models.FileNode).filter(models.FileNode.project_id == project_id).all()

def get_file_content(db: Session, file_id: str):
    """단일 파일 내용 조회 (파일 열기)"""
    return db.query(models.FileNode).filter(
        models.FileNode.id == file_id, 
        models.FileNode.node_type == models.NodeType.FILE
    ).first()

def update_file_content(db: Session, file_id: str, new_content: str):
    """파일 내용 저장"""
    db_file = db.query(models.FileNode).filter(
        models.FileNode.id == file_id,
        models.FileNode.node_type == models.NodeType.FILE
    ).first()
    
    if db_file:
        db_file.content = new_content
        db.commit()
        db.refresh(db_file)
        return db_file
    return None

def rename_node(db: Session, node_id: str, new_name: str):
    """파일/디렉토리 이름 변경"""
    db_node = db.query(models.FileNode).filter(models.FileNode.id == node_id).first()
    if db_node:
        db_node.name = new_name
        db.commit()
        db.refresh(db_node)
        return db_node
    return None

def delete_node(db: Session, node_id: str):
    """파일 또는 디렉토리 삭제 (CASCADE로 인해 하위 폴더/파일도 자동 삭제됨)"""
    db_node = db.query(models.FileNode).filter(models.FileNode.id == node_id).first()
    if db_node:
        db.delete(db_node)
        db.commit()
        return True
    return False

# ==========================================
# 4. 수정 로그 (ProjectLog) 관련 함수
# ==========================================

def create_project_log(db: Session, project_id: str, user_id: str, action_type: str, message: str, target_node_id: str = None, start_time=None):
    """파일 수정 완료 등 특정 액션 후 히스토리 기록 저장"""
    db_log = models.ProjectLog(
        project_id=project_id,
        user_id=user_id,
        target_node_id=target_node_id,
        action_type=action_type,
        message=message,
        start_time=start_time
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

def get_project_logs(db: Session, project_id: str):
    """특정 프로젝트의 수정 히스토리 조회 (최신순 정렬)"""
    return db.query(models.ProjectLog).filter(
        models.ProjectLog.project_id == project_id
    ).order_by(models.ProjectLog.end_time.desc()).all()