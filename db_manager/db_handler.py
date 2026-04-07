# db와 연결및 세션을 관리하는 파일
# 여기서 만든 세션은 api컨테이너가 요청단위로 관리.
# import engine, SessionLocal, Base 해서 db 연결하고 세션 만들어서 api컨테이너에서 사용
# 아래는 제가 작성한 예시 코드입니다. 실제로는 프로젝트에 맞게 수정해서 사용하시면 됩니다.
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DB_URL = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASS')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"

try: 
    engine = create_engine(DB_URL)
    print('DB 연결 성공!')
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base = declarative_base()

except Exception as e:
    print('DB 연결 실패!')