# linux-team-project

Docker DevContainer 기반으로 Nginx + FastAPI + PostgreSQL을 함께 개발하는 팀 프로젝트입니다.

## 1. 프로젝트 구조

```text
linux-team-project/
|- .devcontainer/
|  |- .env
|  |- devcontainer.json
|  |- docker-compose.yml
|  |- fastapi_env/
|  |  |- Dockerfile
|  |  \- requirements.txt
|  \- nginx_env/
|     |- Dockerfile
|     \- requirements.txt
|- fastapi/
|  \- main.py
|- db_manager/
|  |- db_handler.py
|  |- crud.py
|  \- models.py
\- nginx/
   |- nginx.conf
   \- src/
      \- index.html
```

## 2. 서비스 구성

- `db`: PostgreSQL 16
- `api`: FastAPI (Uvicorn, 8000)
- `nginx`: 정적 파일 서빙 + `/api/` 리버스 프록시 (80)

요청 흐름:

`브라우저 -> nginx:80 -> /api/* 요청은 api:8000으로 전달`

## 3. 빠른 시작 (VS Code DevContainer)

1. VS Code에서 프로젝트 폴더 열기
2. `Ctrl + Shift + P`
3. `Dev Containers: Rebuild and Reopen in Container` 실행
4. 기본 개발 컨테이너는 `.devcontainer/devcontainer.json`의 `service` 값(`api`)을 따름

역할별 컨테이너 전환:

- FastAPI 담당: `service: "api"`
- Nginx 담당: `service: "nginx"`

`runServices`에 의해 `db`, `api`, `nginx`는 함께 실행됩니다.

## 4. 환경 변수

공통 환경 변수는 `.devcontainer/.env`에서 관리합니다.
제가 카톡으로 드린 .env 파일을 프로젝트 /.devcontainer 안에 넣으시고 빌드하시면 됩니다.

주요 DB 변수:

- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASS`
- `DB_PORT`

파이썬 코드에서 사용 예시:

```python
import os

db_user = os.getenv("DB_USER")
```

주의:

- `.env` 수정 후에는 컨테이너를 다시 열어 반영하세요.
- `.env` 변경 사항은 팀원 전체에게 반드시 공유하세요.

## 5. 역할별 작업 가이드

### 5-1. FastAPI 담당

작업 위치:

- `fastapi/main.py`: API 엔드포인트
- `db_manager/db_handler.py`: DB 엔진/세션
- `db_manager/models.py`: ORM 모델
- `db_manager/crud.py`: DB CRUD 함수

현재 상태:

- `fastapi/main.py`는 템플릿 주석만 있는 초기 상태입니다.
- 실제 엔드포인트(`GET`, `POST` 등) 구현이 필요합니다.

외부라이브러리 추가:

- `.devcontainer/fastapi_env/requirements.txt`에 라이브러리 추가
- DevContainer 재빌드

### 5-2. Nginx 담당

작업 위치:

- `nginx/nginx.conf`: 웹서버/프록시 설정
- `nginx/src/index.html`: 정적 페이지

현재 설정 요약:

- `/` -> 정적 파일 제공
- `/api/` -> `http://api:8000/`으로 프록시

외부라이브러리 추가:

- `.devcontainer/nginx_env/requirements.txt` 수정
- DevContainer 재빌드

### 5-3. DB 담당 (PostgreSQL)

핵심 포인트:

- DB 컨테이너는 `postgres:16-bookworm` 사용
- 데이터는 Docker 볼륨 `postgres-data`에 보존
- FastAPI는 `.env` 값을 통해 DB에 연결
- sqlalchemy를 사용한 파이썬을 통한 팀원들이 활용할 DB조작 모듈 생성에 집중(ex. 로그인용 아이디 비번 확인 모듈)

## 6. 컨테이너/Dockerfile 참고

- FastAPI 이미지: `.devcontainer/fastapi_env/Dockerfile`
  - `python:3.11-slim-bookworm`
  - `uvicorn main:app --port 8000`
- Nginx 이미지: `.devcontainer/nginx_env/Dockerfile`
  - `nginx:alpine`
  - `nginx/nginx.conf`, `nginx/src` 복사
  - `nginx -g "daemon off;"`

## 7. 팀 협업 규칙 (권장)

- 기능 단위 브랜치 사용: `feature/<name>`
- PR 설명에 변경 파일/테스트 방법 명시
- 공통 설정 파일(`.env`, `docker-compose.yml`, `devcontainer.json`) 수정 시 팀 공지
- 항상 빌드테스트(rebuild) 확인 후 develop 리모트에 푸쉬
- develop에 머지하는 경우 팀원들에게 먼저 알리기.

## 8. 문제 해결 체크리스트

- 컨테이너가 안 뜰 때:
  - DevContainer 재빌드
  - `docker-compose.yml`의 서비스명/경로 확인
- API 연결이 안 될 때:
  - Nginx의 `/api/` 프록시 대상이 `api:8000`인지 확인
  - FastAPI 서버 실행 여부 확인
- DB 연결 실패 시:
  - `.env`의 DB 변수 확인
  - `db_manager/db_handler.py`의 연결 문자열 확인