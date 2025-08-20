########################
# 1) Deps/Build Stage  #
########################
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS deps

WORKDIR /app

# 의존성 캐시를 위해 패키지 메타만 먼저 복사
COPY package*.json ./

# 프로덕션 의존성만 설치
RUN npm ci --omit=dev

# (옵션) gemini CLI 전역 설치를 빌드 캐시에 포함
# 버전 고정하고 싶으면: --build-arg GEMINI_CLI_PKG=@google/gemini-cli@0.8.0
ARG GEMINI_CLI_PKG=@google/gemini-cli
RUN npm i -g ${GEMINI_CLI_PKG}

########################
# 2) Runtime Stage     #
########################
FROM ${NODE_IMAGE} AS runtime

WORKDIR /app

# 런타임 환경변수(필요 시 Helm에서 덮어쓰기)
ENV NODE_ENV=production \
    PORT=3000 \
    GEMINI_MODEL=gemini-1.5-flash \
    INPUT_CHAR_LIMIT=120000

# 빌드 단계에서 설치한 의존성/전역 CLI만 복사
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY --from=deps /usr/local/bin/gemini /usr/local/bin/gemini
COPY --from=deps /usr/local/lib/node_modules /usr/local/lib/node_modules

# 애플리케이션 소스
COPY public ./public
COPY src ./src
COPY server.js ./

# 결과 파일 저장 디렉터리(사용자별 data/)
RUN mkdir -p /app/data && chown -R node:node /app

# 보안: 비루트 실행
USER node

# 서비스 포트
EXPOSE 3000


# Helm이 command/args로 시작을 관리할 것이므로 기본 CMD/ENTRYPOINT 없음
# 예: command: ["node"], args: ["server.js"]
#CMD ["node", "server.js"]
