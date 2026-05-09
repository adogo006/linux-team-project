<<<<<<< HEAD
# db와 연결및 세션을 관리하는 파일
# 여기서 만든 세션은 api컨테이너가 요청단위로 관리.
# import engine, SessionLocal, Base 해서 db 연결하고 세션 만들어서 api컨테이너에서 사용
# 아래는 제가 작성한 예시 코드입니다. 실제로는 프로젝트에 맞게 수정해서 사용하시면 됩니다.
=======
>>>>>>> feature/db-setup
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

<<<<<<< HEAD
DB_URL = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASS')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"

try: 
    engine = create_engine(DB_URL)
    print('DB 연결 성공!')
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base = declarative_base()

except Exception as e:
    print('DB 연결 실패!')
=======
# 1. DB 접속 정보 설정 (환경 변수 활용)
# Docker 환경이므로 os.getenv를 통해 정보를 가져오는 방식
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "password")
DB_HOST = os.getenv("DB_HOST", "db")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "insideviral")

DB_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# 2. SQLAlchemy 엔진 생성
# pool_pre_ping=True를 추가하여 연결이 끊겼을 때 자동으로 재연결을 시도하도록 설정했습니다.
engine = create_engine(
    DB_URL, 
    pool_pre_ping=True
)

# 3. 세션 생성기 설정
# 요청마다 독립적인 세션을 제공하기 위해 세션을 미리 설정해둡니다.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. 모든 모델의 부모가 될 Base 클래스
# 우리가 만든 models.py에서 이 Base를 상속받아 테이블을 정의하게 됩니다.
Base = declarative_base()

# 5. FastAPI에서 사용할 의존성 주입 함수 (핵심!)
# API 엔드포인트에서 이 함수를 사용해 안전하게 DB 세션을 열고 닫습니다.
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
>>>>>>> feature/db-setup
