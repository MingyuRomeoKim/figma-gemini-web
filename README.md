# Figma → Gemini Web (포트 3000)

웹 UI에서 FIGMA_PAT / GEMINI_API_KEY / 프롬프트를 입력하고 Figma 링크로 분석하면, review 결과가 화면에 렌더링됩니다.

## 요구 사항
- Node.js **20+** (권장 22 LTS)
- 인터넷 연결 (Figma/Gemini API 호출)

## 실행
```bash
npm install
npm start   # http://localhost:3000
```

## 도커실행
```bash
# 빌드 (필요 시 CLI 버전 고정)
docker build -t figma-gemini-web:latest \
  --build-arg GEMINI_CLI_PKG=@google/gemini-cli .

# 로컬 기동(Helm 없이 테스트할 때만)
docker run --rm -p 3000:3000 \
  -v figma_data:/app/data \
  --name figma-gemini-web figma-gemini-web:latest \
  node server.js
```

## 사용 흐름
1. 브라우저에서 `http://localhost:3000` 접속
2. FIGMA_PAT, GEMINI_API_KEY, 프롬프트 입력 후 **저장**
3. Figma 문서 주소 입력 → **분석하기**
4. 화면 하단에 리뷰 결과가 렌더링됩니다.

### 모델/입력 제한
- 기본 모델: `gemini-1.5-flash` (쿼터 여유, 속도 빠름)
- 필요시 상단 드롭다운에서 모델 변경
- 입력 길이 제한(문자 수)로 과도한 토큰 사용을 방지합니다 (기본 120,000).

## 내부 동작
- 서버(Express)가 Figma API에서 TEXT 레이어를 추출해 `figma.md` 생성
- 사용자가 준 프롬프트에 루브릭을 주입
- **gemini-cli**를 하위 프로세스로 실행(없으면 `npx @google/gemini-cli` 폴백)
- 결과 markdown을 `marked`로 HTML로 변환하여 반환

## 문제 해결
- Node 18에서 `File is not defined` → Node 20+로 업그레이드
- 429 (quota exceeded) → 모델을 Flash로 변경하고 입력 제한을 줄이세요.
- 결과가 비어있다 → `telemetry.log`를 확인하세요.
