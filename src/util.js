export const defaultRubric = [
  "문제정의/목표(KPI 명시)",
  "범위/비범위(Out of Scope)",
  "페르소나/유저 여정",
  "기능 요구(유저 스토리+수용기준)",
  "비기능(SLO/보안/가용성/장애대응)",
  "데이터/이벤트/로그/지표(AB)",
  "외부연동/API/제약",
  "리스크/가정/의존성/마일스톤",
  "릴리즈/롤아웃/모니터링/운영"
];

export function buildPromptFromUser(userPrompt, rubricSections = defaultRubric) {
  const list = rubricSections.map(s => `- ${s}`).join("\n");
  if (userPrompt.includes("{{RUBRIC_SECTIONS}}")) {
    return userPrompt.replace("{{RUBRIC_SECTIONS}}", list);
  }
  return `${userPrompt.trim()}\n\n[루브릭]\n${list}`;
}
