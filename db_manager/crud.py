# db 안 데이터를 조작하는 함수 모듈
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pathlib import Path
from . import models

# ==========================================
# 1. 사용자 (User) 관련 함수
# ==========================================

def get_user_by_username(db: Session, username: str):
    """로그인 및 중복 체크 시 아이디로 유저 조회"""
    return db.query(models.User).filter(models.User.id == username).first()


def get_user_by_user_id(db: Session, user_id: str):
    """호환용 별칭: user_id로 유저 조회"""
    return get_user_by_username(db, user_id)

def get_user_by_nickname(db: Session, nickname: str):
    """닉네임 중복 체크 시 조회"""
    return db.query(models.User).filter(models.User.nickname == nickname).first()

def create_user(db: Session, user_id: str, password: str, nickname: str):
    """회원가입 기능 (새 계정 생성)"""
    if not user_id or not password or not nickname:
        return None

    db_user = models.User(
        id=user_id, 
        password=password, 
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
        project_uid=db_project.uid,
        user_id=creator_id, 
    )
    db.add(db_member)
    db.commit()

    # 3. 생성된 프로젝트의 루트디렉토리 생성
    create_file_node(
        db=db,
        project_id=db_project.uid,
        name=project_name,
        node_type=models.NodeType.DIRECTORY,
        parent_id=None,
    )
    
    return db_project

def get_project_list_by_user(db: Session, user_id: str):
    """특정 유저가 속해있는(수정 가능한) 프로젝트 목록 반환"""
    # ProjectMember 테이블을 조인해서 해당 유저가 포함된 프로젝트만 가져옴
    return db.query(models.Project).join(
        models.ProjectMember,
        models.Project.uid == models.ProjectMember.project_uid,
    ).filter(
        models.ProjectMember.user_id == user_id,
    ).all()


def get_projects_by_user_id(db: Session, user_id: str):
    """호환용 별칭: 사용자 프로젝트 목록"""
    return get_project_list_by_user(db, user_id)

def invite_project_member(db: Session, project_id: str, inviter_id: str, invitee_id: str):
    """ 프로젝트에게 초대요청을 보냄 """
    # 초대 요청 생성
    invite_request = models.InviteRequest(
        project_uid=project_id,
        inviter_id=inviter_id,
        invitee_id=invitee_id,
    )
    db.add(invite_request)
    db.commit()
    db.refresh(invite_request)
    return invite_request



def add_project_member(db: Session, project_id: str, user_id: str):
    """프로젝트 멤버 추가 (role은 호환용 파라미터로만 받음)."""
    db_member = models.ProjectMember(project_uid=project_id, user_id=user_id)
    db.add(db_member)
    db.commit()
    db.refresh(db_member)
    return db_member


def check_project_member(db: Session, project_id: str, user_id: str):
    """유저의 프로젝트 멤버 여부 확인"""
    return (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.project_uid == project_id,
            models.ProjectMember.user_id == user_id,
        )
        .first()
        is not None
    )

def get_project_members(db: Session, project_id: str):
    """프로젝트 멤버 목록 조회"""
    return db.query(models.ProjectMember).filter(models.ProjectMember.project_uid == project_id).all()

def get_project_by_id(db: Session, project_id: str):
    """project uid로 프로젝트 조회"""
    return db.query(models.Project).filter(models.Project.uid == project_id).first()

def delete_project(db: Session, project):
    """프로젝트 삭제"""
    db.delete(project)
    db.commit()
    return True

def remove_project_member(db: Session, project_id: str, target_user_id: str):
    """프로젝트 멤버 제거 기능 (자기 자신도 제거 가능)"""
    member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_uid == project_id,
        models.ProjectMember.user_id == target_user_id
    ).first()
    
    if member:
        db.delete(member)
        db.commit()
        return True
    return False

# ==========================================
# 3. 파일 및 폴더 (FileNode) 관련 함수
# ==========================================

def create_file_node(db: Session, project_id: str, name: str, node_type: models.NodeType, parent_id: str = None):
    """파일 또는 디렉토리 생성. 파일이면 /user_uploads에 실제 파일도 만든다."""
    db_node = models.FileNode(
        project_uid=project_id,
        display_name=name,
        node_type=node_type,
        parent_uid=parent_id,
        file_path=None,
    )
    db.add(db_node)
    db.commit()
    db.refresh(db_node)

    if node_type == models.NodeType.FILE:
        uploads_dir = Path("/user_uploads")
        uploads_dir.mkdir(parents=True, exist_ok=True)

        physical_file_path = uploads_dir / str(db_node.uid)
        physical_file_path.touch(exist_ok=True)

        db_node.file_path = str(physical_file_path)
        db.commit()
        db.refresh(db_node)

    return db_node

def get_project_nodes(db: Session, project_id: str):
    """프로젝트 내의 모든 파일/폴더 구조 가져오기 (프로젝트 Open 시 사용)"""
    return db.query(models.FileNode).filter(models.FileNode.project_uid == project_id).all()

def get_descendant_file_nodes(db: Session, node_id: str):
    """특정 노드의 모든 하위 파일 노드(재귀적으로) 조회"""
    descendant_files = []
    nodes_to_visit = [node_id]

    while nodes_to_visit:
        current_node_id = nodes_to_visit.pop()
        child_nodes = db.query(models.FileNode).filter(models.FileNode.parent_uid == current_node_id).all()
        
        for child in child_nodes:
            if child.node_type == models.NodeType.FILE:
                descendant_files.append(child)
            elif child.node_type == models.NodeType.DIRECTORY:
                nodes_to_visit.append(str(child.uid))

    return descendant_files

def get_project_file_tree(db: Session, project_id: str):
    """프로젝트 파일 트리를 중첩 구조로 반환 (웹 UI용 - 왼쪽 폴더 패널)"""
    nodes = get_project_nodes(db, project_id)
    
    # uid -> 노드 딕셔너리 맵 생성
    node_map = {}
    root_nodes = []
    
    for node in nodes:
        node_dict = {
            "id": str(node.uid),
            "name": node.display_name,
            "type": node.node_type.value, #프론트에 file or directory로 전달 
            "path": node.file_path,
            "children": [],
        }
        # uid를 키로 하는 딕셔너리 값을 가지는 딕셔너리
        node_map[str(node.uid)] = node_dict
        
        # 부모가 없으면 루트 노드
        if node.parent_uid is None:
            root_nodes.append(node_dict)
    
    # 부모-자식 관계 연결
    for node in nodes:
        if node.parent_uid is not None:
            parent_id = str(node.parent_uid)
            if parent_id in node_map:
                node_map[parent_id]["children"].append(node_map[str(node.uid)])
    
    return root_nodes


def get_file_node(db: Session, file_id: str):
    """단일 파일 조회"""
    return db.query(models.FileNode).filter(
        models.FileNode.uid == file_id
    ).first()


def read_file_content(db: Session, file_id: str) -> str:
    """파일 노드가 가리키는 실제 파일의 문자 내용을 읽어 반환한다."""
    file_node = get_file_node(db, file_id)
    if not file_node or not file_node.file_path:
        return ""

    file_path = Path(file_node.file_path)
    if not file_path.exists():
        return ""

    return file_path.read_text(encoding="utf-8")

def save_file_content(db: Session, file_id: str, content: str):
    """파일 노드가 가리키는 실제 파일에 문자 내용을 저장한다."""
    file_node = get_file_node(db, file_id)
    if not file_node or not file_node.file_path:
        return False

    file_path = Path(file_node.file_path)
    file_path.write_text(content, encoding="utf-8")
    return True

def delete_file_data(file_path: str):
    """파일 노드가 가리키는 실제 파일 삭제 (노드 삭제 시 호출)"""
    path = Path(file_path)
    if path.exists():
        path.unlink()

def rename_node(db: Session, node_id: str, new_name: str):
    """파일/디렉토리 이름 변경"""
    db_node = db.query(models.FileNode).filter(models.FileNode.uid == node_id).first()
    if db_node:
        db_node.display_name = new_name
        db.commit()
        db.refresh(db_node)
        return db_node
    return None

def rename_project(db: Session, project, new_name: str):
    """프로젝트 이름 변경 (프로젝트 이름과 루트 디렉토리 이름을 함께 변경)"""
    project.name = new_name

    root_node = db.query(models.FileNode).filter(
        models.FileNode.project_uid == project.uid,
        models.FileNode.parent_uid == None
    ).first()

    if root_node:
        root_node.display_name = new_name

    db.commit()
    db.refresh(project)
    return project

def delete_node(db: Session, node_id: str):
    """파일 또는 디렉토리 삭제 (CASCADE로 인해 하위 폴더/파일도 자동 삭제됨)"""
    db_node = db.query(models.FileNode).filter(models.FileNode.uid == node_id).first()
    if db_node:
        db.delete(db_node)
        db.commit()
        return True
    return False

# ==========================================
# 4. 수정 로그 (ProjectLog) 관련 함수
# ==========================================

def create_project_log(
    db: Session,
    project_id: str,
    user_id: str | None = None,
    action_type: str | None = None,
    message: str | None = None,
    target_node_id: str | None = None,
    start_time=None,
    nickname: str | None = None,
    action: str | None = None,
):
    """파일 수정 완료 등 특정 액션 후 히스토리 기록 저장"""
    if user_id is None and nickname:
        user = get_user_by_nickname(db, nickname)
        user_id = user.id if user else None

    action_type = action_type or action or "UNKNOWN"
    message = message or ""

    db_log = models.ProjectLog(
        project_uid=project_id,
        user_id=user_id,
        target_node_uid=target_node_id,
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
        models.ProjectLog.project_uid == project_id
    ).order_by(models.ProjectLog.end_time.desc()).all()

def get_invite_list(db: Session, user_id: str):
    """특정 유저가 받은 프로젝트 초대 목록 조회"""
    return db.query(models.InviteRequest).filter(
        models.InviteRequest.invitee_id == user_id
    ).all()

def get_invite_by_id(db: Session, project_id: str, user_id: str):
    """초대 요청 ID로 특정 초대 요청 조회"""
    return db.query(models.InviteRequest).filter(
        models.InviteRequest.project_uid == project_id,
        models.InviteRequest.invitee_id == user_id
    ).first()