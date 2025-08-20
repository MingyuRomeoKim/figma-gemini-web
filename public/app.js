async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let msg;
    try { msg = (await res.json()).error; } catch { msg = await res.text(); }
    throw new Error(msg);
  }
  return res.json();
}

const $ = (id) => document.getElementById(id);

$("saveCfg").addEventListener("click", async () => {
  try {
    $("status").textContent = "";
    const figmaPat = $("figmaPat").value.trim();
    const geminiApiKey = $("geminiKey").value.trim();
    const prompt = $("prompt").value;
    const model = $("model").value;
    const inputCharLimit = $("limit").value;

    const r = await postJSON("/api/config", { figmaPat, geminiApiKey, prompt, model, inputCharLimit });
    $("step2").classList.remove("hidden");
    $("status").textContent = `설정 저장 완료 (model=${r.model}, limit=${r.inputCharLimit})`;
  } catch (e) {
    alert("설정 저장 실패: " + e.message);
  }
});

$("analyze").addEventListener("click", async () => {
  const link = $("figmaLink").value.trim();
  if (!link) return alert("Figma 링크를 입력하세요.");
  $("status").textContent = "분석 중… 잠시만요.";
  $("result").innerHTML = "";
  try {
    const r = await postJSON("/api/review", { link });
    $("status").textContent = "완료";
    $("result").innerHTML = r.html || `<pre>${r.markdown}</pre>`;
  } catch (e) {
    $("status").textContent = "에러";
    $("result").innerHTML = `<pre class="text-red-600 whitespace-pre-wrap">${e.message}</pre>`;
  }
});
