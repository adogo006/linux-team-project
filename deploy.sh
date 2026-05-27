#!/bin/bash

# 에러 발생 시 즉시 종료 (안전한 배포를 위해 필수)
set -e

# 설정 변수
PROJECT_DIR="/home/adogo006/linux-team-project" # 실제 프로젝트 경로로 수정하세요
DOCKER_COMPOSE_FILE="docker-compose-prod.yml"
USER_DATA_DIR="user_uploads"
BRANCH="release-1.0.0"

echo "=== 배포 시작: $(date) ==="

# 1. 프로젝트 디렉토리로 이동
cd $PROJECT_DIR

# 2. 기존 컨테이너 종료
echo "-> 기존 컨테이너 중지 중..."
docker compose -f $DOCKER_COMPOSE_FILE down

# # 3. 권한 설정
# echo "-> 파일 권한 설정 중..."
# sudo chown -R adogo006:adogo006 $USER_DATA_DIR

# 4. 코드 업데이트
echo "-> 코드 업데이트 중 (Branch: $BRANCH)..."
git fetch origin $BRANCH
git reset --hard origin/$BRANCH
git clean -fd

# 5. 컨테이너 재시작
echo "-> 컨테이너 실행 중..."
docker compose -f $DOCKER_COMPOSE_FILE up -d

echo "=== 배포 완료: $(date) ==="