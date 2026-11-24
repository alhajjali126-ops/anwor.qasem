const SYSTEM_PROMPT = `# SYSTEM PROMPT — MULTILINGUAL PLATFORM-ALIGNED OPINION ASSISTANT (v2.0)

## 1. Identity & Operational Boundary
You are a standalone, multilingual editorial and opinion-drafting engine designed to assist a human user in formulating natural, thoughtful reactions to articles, short passages, and discussion prompts commonly encountered on reader-engagement and opinion platforms (such as Prime Opinion).
- Human-in-the-Loop Architecture: Your sole responsibility is to analyze the provided text and generate a realistic, ready-to-edit draft opinion. The human user retains 100% control over reviewing, editing, and manually submitting the final text.
- Strict Non-Automation: Never generate scripts, instructions, or behaviors intended to automate browser/app interactions, scrape live platforms, or bypass platform terms of service.

## 2. Domain & Content Pattern Calibration
Articles and prompts on opinion/engagement platforms typically focus on everyday consumer topics, workplace trends, lifestyle, technology adoption, health habits, personal finance, or cultural shifts. Your responses must align naturally with this context:
- Reader Mindset: Respond from the perspective of an attentive, everyday reader sharing an honest, practical takeaway—never as an academic researcher, corporate spokesperson, or AI assistant.
- Constructive Nuance: Real human opinions rarely sound 100% one-sided or overly dramatic. Balance clear agreement or disagreement with realistic everyday context (e.g., noting practical trade-offs, conditional usefulness, or how a trend plays out in daily life).

## 3. Automatic Language & Register Synchronization
- Zero-Friction Language Detection: Automatically detect the exact language (and regional/standard register) of the input article or prompt, and generate the entire response in that exact same language, unless the user explicitly requests a different output language.
- Native Flow: Use natural idioms, contractions, and conversational rhythm appropriate to a native speaker of the detected language. Avoid stiff, literal, or textbook-style translations.

## 4. Anti-AI Fingerprinting & Linguistic Naturalness
To ensure every draft reads authentically and avoids generic AI patterns:
- Banned Patterns: Never start with robotic openers (e.g., "This article discusses...", "In today's fast-paced world...", "As a reader...", "It is important to note..."). Never use bullet points, numbered lists, bold headers, or concluding summary clichés ("In conclusion...", "Overall...").
- Structural Variety: Vary sentence lengths dynamically—combine crisp, direct observations with slightly more reflective sentences. Rotate opening angles across consecutive inputs (e.g., starting with a practical observation, a mild caveat, a direct reaction to the main claim, or a relatable everyday implication).
- Grounded Realism: Rely strictly on the themes, facts, and arguments present in the provided text plus basic common sense. Never fabricate fake personal anecdotes, invented statistics, or external claims not grounded in the source text.

## 5. Length & Format Calibration
- Default Length: Aim for 2 to 4 natural sentences (roughly 35–75 words), matching the concise, high-signal format expected in reader opinion fields—unless the user specifies a shorter or longer target length.
- Strict Output Contract: Output ONLY the raw, clean opinion text. Do not include quotation marks around the response, labels (such as "Opinion:" or "Draft:"), explanations, or conversational filler before or after the draft.`;

const STANCE = {
  auto: "",
  agree: "Stance: lean towards agreeing with the main claim, with a small realistic caveat.",
  disagree: "Stance: lean towards disagreeing with the main claim, politely and with a practical reason.",
  mixed: "Stance: balanced, agree on one point and push back on another."
};

const LENGTH = {
  short: "Length: about 25-40 words.",
  default: "",
  long: "Length: about 80-110 words."
};

const ANGLE = {
  auto: "",
  practical: "Opening angle: a practical observation.",
  caveat: "Opening angle: a mild caveat.",
  reaction: "Opening angle: a direct reaction to the main claim.",
  daily: "Opening angle: a relatable everyday implication."
};

const PRESETS = {
  quick: { stance: "agree", length: "short", angle: "practical", label: "تعليق سريع" },
  balanced: { stance: "mixed", length: "default", angle: "caveat", label: "رأي متوازن" },
  deep: { stance: "disagree", length: "long", angle: "daily", label: "تحليل أعمق" }
};

const ANGLES = ["practical", "caveat", "reaction", "daily"];
const $ = (id) => document.getElementById(id);

const state = {
  stance: "auto",
  length: "default",
  angle: "auto",
  history: []
};

const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  }
};

let deferredInstallPrompt = null;

function setSegValue(key, val) {
  state[key] = val;
  const group = document.querySelector(`.seg[data-key="${key}"]`);
  if (!group) return;
  group.querySelectorAll("button").forEach((btn) => {
    const active = btn.dataset.v === val;
    btn.classList.toggle("on", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function syncPresetHighlights() {
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    const p = PRESETS[btn.dataset.preset];
    const match = p && p.stance === state.stance && p.length === state.length && p.angle === state.angle;
    btn.classList.toggle("active", Boolean(match));
  });
}

function updateInputMetrics() {
  const txt = $("text").value;
  const trimmed = txt.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  $("inCount").textContent = String(txt.length);
  $("inWords").textContent = `${words} كلمة`;
}

function updateDraftMetrics() {
  const raw = $("draft").value.trim();
  const words = raw ? raw.split(/\s+/).length : 0;
  const chars = raw.length;
  const sentences = raw ? raw.split(/[.!?؟]+/).filter((s) => s.trim().length > 0).length : 0;

  $("wc").textContent = `${words} كلمة`;
  $("statWords").textContent = String(words);
  $("statSentences").textContent = String(sentences);
  $("statChars").textContent = String(chars);

  const clamped = Math.min(words, 110);
  $("dot").style.insetInlineStart = `${(clamped / 110) * 100}%`;
  $("dot").classList.toggle("in", words >= 35 && words <= 75);
}

function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "note";
    empty.textContent = "لا توجد مسودات محفوظة في الجلسة الحالية بعد.";
    list.appendChild(empty);
    return;
  }

  state.history.forEach((item, idx) => {
    const rowBtn = document.createElement("button");
    rowBtn.type = "button";
    rowBtn.className = "history-item";
    rowBtn.title = "استرجاع هذه المسودة";

    const txtSpan = document.createElement("span");
    txtSpan.className = "history-item__txt";
    txtSpan.textContent = item.text;

    const badge = document.createElement("span");
    badge.className = "history-item__badge";
    badge.textContent = `#${state.history.length - idx} · ${item.words} ك`;

    rowBtn.appendChild(txtSpan);
    rowBtn.appendChild(badge);
    rowBtn.addEventListener("click", () => {
      $("draft").value = item.text;
      updateDraftMetrics();
    });
    list.appendChild(rowBtn);
  });
}

function pushHistory(text) {
  const clean = text.trim();
  if (!clean) return;
  const words = clean.split(/\s+/).length;
  state.history = [{ text: clean, words }, ...state.history.slice(0, 5)];
  renderHistory();
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  const chip = $("netStatus");
  chip.classList.toggle("offline", !online);
  $("netLabel").textContent = online ? "متصل" : "وضع عدم الاتصال";
}

async function runDraft(angleOverride) {
  const err = $("err");
  const btn = $("go");
  err.hidden = true;

  const text = $("text").value.trim();
  const key = (store.get("oa_key") || "").trim();
  const model = (store.get("oa_model") || "claude-sonnet-5-5").trim() || "claude-sonnet-5-5";

  try {
    if (!key) {
      $("key").value = "";
      $("model").value = model;
      $("dlg").showModal();
      throw new Error("أضف مفتاح Anthropic API من الإعدادات للمتابعة.");
    }
    if (!text) {
      throw new Error("الصق المقال أو السؤال أولاً قبل توليد المسودة.");
    }

    btn.disabled = true;
    btn.textContent = "جاري صياغة المسودة...";

    const extra = [
      STANCE[state.stance],
      LENGTH[state.length],
      ANGLE[angleOverride || state.angle],
      $("language").value ? `Output language: ${$("language").value}.` : ""
    ].filter(Boolean).join("\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `<article>\n${text}\n</article>${extra ? `\n\n${extra}` : ""}`
        }]
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "حدث خطأ أثناء الاتصال بالخادم.");
    }

    const out = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    $("draft").value = out;
    updateDraftMetrics();
    pushHistory(out);
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "اكتب المسودة";
  }
}

function initEvents() {
  $("settingsBtn").addEventListener("click", () => {
    $("key").value = store.get("oa_key") || "";
    $("model").value = store.get("oa_model") || "claude-sonnet-5-5";
    $("dlg").showModal();
  });

  $("saveKey").addEventListener("click", () => {
    store.set("oa_key", $("key").value.trim());
    store.set("oa_model", $("model").value.trim() || "claude-sonnet-5-5");
  });

  document.querySelectorAll(".seg").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-v]");
      if (!btn) return;
      setSegValue(seg.dataset.key, btn.dataset.v);
      syncPresetHighlights();
    });
  });

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = PRESETS[btn.dataset.preset];
      if (!preset) return;
      setSegValue("stance", preset.stance);
      setSegValue("length", preset.length);
      setSegValue("angle", preset.angle);
      syncPresetHighlights();
    });
  });

  $("pasteBtn").addEventListener("click", async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        $("text").value = clip.slice(0, 8000);
        updateInputMetrics();
      }
    } catch {
      $("text").focus();
    }
  });

  $("clearInputBtn").addEventListener("click", () => {
    $("text").value = "";
    updateInputMetrics();
  });

  $("text").addEventListener("input", updateInputMetrics);
  $("draft").addEventListener("input", updateDraftMetrics);

  $("go").addEventListener("click", () => runDraft());
  $("again").addEventListener("click", () => {
    const nextAngle = state.angle === "auto"
      ? ANGLES[Math.floor(Math.random() * ANGLES.length)]
      : null;
    runDraft(nextAngle);
  });

  $("copy").addEventListener("click", async () => {
    const v = $("draft").value.trim();
    if (!v) return;
    await navigator.clipboard.writeText(v);
    $("copy").textContent = "تم النسخ";
    setTimeout(() => { $("copy").textContent = "نسخ"; }, 1300);
  });

  $("clearDraft").addEventListener("click", () => {
    $("draft").value = "";
    $("err").hidden = true;
    updateDraftMetrics();
  });

  $("clearHistory").addEventListener("click", () => {
    state.history = [];
    renderHistory();
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $("installBtn").hidden = false;
  });

  $("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("installBtn").hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    $("installBtn").hidden = true;
  });

  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/static/service-worker.js").catch(() => {});
    });
  }
}

initEvents();
updateInputMetrics();
updateDraftMetrics();
renderHistory();
updateNetworkStatus();
syncPresetHighlights();
