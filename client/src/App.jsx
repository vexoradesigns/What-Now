import React, { useState, useRef, useCallback } from "react";

const EXAMPLES = [
  {
    id: "landlord",
    label: "Landlord email",
    text: `Subject: Lease Renewal - Action Needed

Hi,

As you know your current lease is coming to an end. We're pleased to offer you a renewal, however please note that due to rising costs in the building we will need to adjust the terms slightly going forward. The new monthly rate reflecting market conditions will be $2,150 (previously $1,800), and this offer is contingent on signing by Friday. If we don't hear back by then we will assume you do not intend to renew and will proceed to list the unit.

Let us know if you have any questions!

Best,
Property Management`,
  },
  {
    id: "groupchat",
    label: "Group chat",
    text: `Sam: honestly kind of surprised you didn't show up last night
Priya: yeah we all rearranged stuff to be there
Sam: it's fine though. it's whatever
Priya: no it's just like, we get it, you're busy
Sam: anyway hope work stuff is going ok for you
Priya: 🙃`,
  },
  {
    id: "insurance",
    label: "Insurance letter",
    text: `RE: Claim #48213-B — Determination of Benefits

Dear Policyholder,

Upon review of the submitted documentation, we have determined that the services rendered on the date of service do not meet the criteria for medical necessity as outlined in Section 4.2(c) of your Evidence of Coverage. Accordingly, the claim has been adjudicated as patient responsibility in the amount of $1,240.00. Should you wish to dispute this determination, a written appeal must be submitted within 30 calendar days of the date of this letter, accompanied by supporting clinical documentation from the rendering provider.

Sincerely,
Claims Review Department`,
  },
];

const INTENTS = [
  {
    id: "explain",
    label: "Explain",
    fullLabel: "Explain this",
    hint: "What does this mean?",
    icon: "💡",
    focus: "User just wants to know what this means, plain and simple. Keep actions minimal.",
  },
  {
    id: "action",
    label: "Act",
    fullLabel: "What should I do?",
    hint: "What should I do?",
    icon: "✅",
    focus: "User wants to know what to do. Make 'actions' the sharpest, most useful part.",
  },
  {
    id: "reply",
    label: "Reply",
    fullLabel: "Help me reply",
    hint: "Help me respond.",
    icon: "💬",
    focus:
      "User needs to reply. Always set needsResponse true and write a short, natural reply — like something they'd actually text or email, not a formal letter.",
    forceReply: true,
  },
  {
    id: "risk",
    label: "Risk",
    fullLabel: "Is there a problem?",
    hint: "What should I watch out for?",
    icon: "⚠️",
    focus:
      "User is worried something is off. Focus on 'watchouts' — but only include one if something's genuinely worth flagging. If nothing's wrong, say that plainly and leave watchouts empty.",
  },
  {
    id: "plan",
    label: "Plan",
    fullLabel: "Make a plan",
    hint: "What are the steps?",
    icon: "📋",
    focus: "User wants a simple plan. Order 'actions' as first, second, third — nothing extra.",
  },
];

// Per-intent accent colors, echoing the color-coded cards in the reference design.
const INTENT_ACCENTS = {
  explain: { light: { c: "#6D4AFF", s: "#EEEAFC" }, dark: { c: "#A78BFA", s: "#2B2650" } },
  action: { light: { c: "#189A5B", s: "#E3F7EA" }, dark: { c: "#4ADE80", s: "#16321F" } },
  reply: { light: { c: "#2563EB", s: "#E6EEFE" }, dark: { c: "#7CA6FF", s: "#1B2A4A" } },
  risk: { light: { c: "#DC5B2E", s: "#FCEBE3" }, dark: { c: "#F0916B", s: "#3A2A20" } },
  plan: { light: { c: "#4B4B63", s: "#ECEAF5" }, dark: { c: "#B9B6E0", s: "#2A2748" } },
};

// NOTE: This prompt and the parts-builder below no longer run in the browser.
// Move both to your Express backend (the route behind /api/analyze) so the
// Gemini key and prompt stay server-side. Kept here only as reference —
// safe to delete once they're ported over.
const SYSTEM_PROMPT_REFERENCE_ONLY = `You are "What Now?". You read confusing messages, screenshots, documents, and emails for a friend and tell them what's going on and what to do. You sound like a smart friend texting them back — not a robot, not a lawyer, not a teacher, not a tech support agent.

Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{
  "whatHappened": "1-2 short sentences, plain everyday English. What this actually is.",
  "actions": ["short plain step 1", "short plain step 2", "short plain step 3 (optional)"],
  "watchouts": ["one short thing to watch for", "second one, only if truly important"],
  "needsResponse": true or false,
  "suggestedResponse": "a short, natural, ready-to-send reply, 1-3 sentences — or empty string if needsResponse is false"
}

Hard limits — do not exceed these:
- "whatHappened": 1-2 sentences MAX. No background, no repeating what the content already said.
- "actions": 3 items MAX. Each a short, plain step (under ~12 words). No sub-explanations.
- "watchouts": 2 items MAX. Only include this at all if there is something genuinely worth flagging — an empty array is correct and expected when nothing's wrong. Never pad it with a minor or obvious point just to fill it.
- "suggestedResponse": 1-3 short sentences. Sounds like a real text or email a person would actually send, not a formal letter.

Voice — this is the most important part:
- Write like you're texting a friend who asked "wait what does this mean." Casual, warm, plain.
- Use everyday words. Say "this looks fake" not "this is a likely phishing attempt." Say "don't trust the link" not "exercise caution regarding the embedded hyperlink."
- Never use words like: "leverage," "utilize," "credentials," "malicious," "fraudulent," "notify," "commence," "ascertain," "in order to," "please be advised." If a simple word works, use it.
- Be direct and confident. Don't hedge with "it appears that," "this could potentially," "you may wish to consider." Just say the thing.
- Don't over-explain. One clear sentence beats two that say the same thing a different way. Don't restate a point you already made.
- Only set needsResponse true if a reply would plausibly be sent by the person, unless told otherwise below.

Safety — follow this closely, especially for anything involving money, passwords or personal info, medical issues, legal issues, or possible scams:
- Never claim to be sure when the content doesn't give you enough to be sure. Say what's unclear in one short plain clause (e.g. "can't tell if this is real") instead of guessing.
- Never invent details, names, dates, or amounts that aren't actually in what the user gave you.
- If something needs checking before the person acts (a phone number, an official website, a claim someone made), tell them what to verify and how — don't just say "be careful."
- Never write a suggested reply that asks anyone for a password, one-time code (OTP), private key, or other sensitive credential — flag it as a red flag instead if the original message is asking for one of these.
- Keep every warning short and practical. No lectures.
- The user will tell you what they need most right now — follow that focus while staying inside every limit and rule above.`;

function buildGeminiParts(input, intent) {
  const parts = [];
  if (input.mode === "image" && input.image) {
    parts.push({ inlineData: { mimeType: input.image.mimeType, data: input.image.base64 } });
    parts.push({ text: "Here is a screenshot or photo. Analyze it per your instructions." });
  } else if (input.mode === "document" && input.document) {
    if (input.document.kind === "pdf") {
      parts.push({ inlineData: { mimeType: "application/pdf", data: input.document.base64 } });
      parts.push({ text: "Here is a document. Analyze it per your instructions." });
    } else {
      parts.push({ text: `Here is a document (${input.document.name}):\n\n${input.document.text}` });
    }
  } else {
    parts.push({ text: `Here is the content to analyze:\n\n${input.text}` });
  }
  parts.push({ text: `What the user needs right now: "${intent.fullLabel}". ${intent.focus}` });
  return parts;
}

async function analyzeContent(input, intent) {
  // Calls your own Express backend, which holds the Gemini key server-side
  // and proxies the request on. The backend owns SYSTEM_PROMPT and
  // buildGeminiParts-equivalent logic now — nothing secret ships to the client.
  const API_URL = import.meta.env.VITE_API_URL;

const response = await fetch(`${API_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input,
      intent: { id: intent.id, fullLabel: intent.fullLabel, focus: intent.focus, forceReply: !!intent.forceReply },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Too many requests right now. Try again in a moment.");
    }
    throw new Error("The analysis request failed. Try again.");
  }

  const parsed = await response.json();

  try {
    if (intent.forceReply) parsed.needsResponse = true;
    if (Array.isArray(parsed.actions)) parsed.actions = parsed.actions.slice(0, 3);
    if (Array.isArray(parsed.watchouts)) parsed.watchouts = parsed.watchouts.slice(0, 2);
    return parsed;
  } catch (e) {
    throw new Error("Couldn't make sense of the response. Try again.");
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsText(file);
  });
}

export default function WhatNowApp() {
  const [isDark, setIsDark] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [step, setStep] = useState("input"); // 'input' | 'intent' | 'result'
  const [mode, setMode] = useState("text"); // 'text' | 'image' | 'document'
  const [textInput, setTextInput] = useState("");
  const [image, setImage] = useState(null);
  const [document, setDocument] = useState(null);
  const [selectedIntentId, setSelectedIntentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);

  const colors = isDark ? darkColors : lightColors;
  const styles = buildStyles(colors);

  const hasInput =
    mode === "text" ? textInput.trim().length > 0 : mode === "image" ? !!image : !!document;
  const currentInput = { mode, text: textInput, image, document };

  const runAnalysis = useCallback(
    async (intent, overrideInput) => {
      const input = overrideInput || currentInput;
      setSelectedIntentId(intent.id);
      setLoading(true);
      setError("");
      try {
        const data = await analyzeContent(input, intent);
        setResult(data);
        setStep("result");
      } catch (e) {
        setError(e.message || "Something went wrong. Try again.");
        setStep("input");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, textInput, image, document]
  );

  const handleImageFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError("");
    const base64 = await fileToBase64(file);
    setImage({ base64, mimeType: file.type, previewUrl: URL.createObjectURL(file), name: file.name });
  };

  const handleDocumentFile = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    setError("");
    try {
      if (ext === "pdf") {
        const base64 = await fileToBase64(file);
        setDocument({ kind: "pdf", base64, name: file.name, ext });
      } else if (ext === "docx") {
        const arrayBuffer = await file.arrayBuffer();
        const mammoth = (await import("mammoth")).default;
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        setDocument({ kind: "text", text: value, name: file.name, ext });
      } else if (ext === "txt") {
        const text = await fileToText(file);
        setDocument({ kind: "text", text, name: file.name, ext });
      } else {
        setError("Please upload a PDF, DOCX, or TXT file.");
      }
    } catch (e) {
      setError("Couldn't read that file. Try a different one.");
    }
  };

  const selectedIntent = INTENTS.find((intent) => intent.id === selectedIntentId);

  const runSelectedIntent = () => {
    if (!hasInput) return;
    setError("");
    runAnalysis(selectedIntent || INTENTS[0]);
  };

  const loadExample = (ex) => {
    setResult(null);
    setError("");
    setImage(null);
    setDocument(null);
    setMode("text");
    setTextInput(ex.text);
    setSelectedIntentId(null);
    setStep("input");
  };

  const startOver = () => {
    setResult(null);
    setError("");
    setTextInput("");
    setImage(null);
    setDocument(null);
    setSelectedIntentId(null);
    setMode("text");
    setStep("input");
  };

  const askSomethingElse = () => {
    setResult(null);
    setError("");
    setSelectedIntentId(null);
    setStep("input");
  };

  const copyResponse = async () => {
    if (!result?.suggestedResponse) return;
    try {
      await navigator.clipboard.writeText(result.suggestedResponse);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      /* clipboard unavailable */
    }
  };

  return (
    <div style={styles.page} className="wn-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .wn-textarea:focus, .wn-tab:focus-visible, .wn-btn:focus-visible, .wn-chip:focus-visible,
        .wn-drop:focus-visible, .wn-intent:focus-visible, .wn-theme:focus-visible, .wn-tool:focus-visible {
          outline: 2px solid ${colors.teal}; outline-offset: 2px;
        }
        .wn-drop.dragging { border-color: ${colors.teal} !important; background: ${colors.tealSoft} !important; }
        .wn-intent { transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease; }
        .wn-intent:hover:not(:disabled) { border-color: ${colors.teal}; transform: translateY(-1px); }
        .wn-action { transition: transform .15s ease, box-shadow .15s ease; }
        .wn-action:active { transform: translateY(0); }
        .wn-tool:disabled { opacity: 0.45; cursor: not-allowed; }
        @keyframes wn-scan {
          0% { transform: translateY(-2px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(180px); opacity: 0; }
        }
        @keyframes wn-fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes wn-spin { to { transform: rotate(360deg); } }
        @keyframes wn-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        .wn-card { animation: wn-fade-up 0.35s ease both; }
        .wn-spinner { animation: wn-spin 0.8s linear infinite; }
        .wn-loading-text { animation: wn-pulse 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .wn-scanline, .wn-card, .wn-spinner, .wn-loading-text { animation: none !important; }
        }

        /* Desktop layout */
        @media (min-width: 860px) {
          .wn-page { padding-bottom: 48px !important; }
          .wn-container { max-width: 980px !important; }
          .wn-bottomnav { display: none !important; }
          .wn-hero { text-align: center !important; max-width: 640px !important; margin: 8px auto 28px !important; }
          .wn-hero-text { margin-left: auto !important; margin-right: auto !important; }
          .wn-input-card { padding: 28px !important; }
          .wn-intent-list { display: grid !important; grid-template-columns: repeat(5, 1fr) !important; gap: 12px !important; }
          .wn-intent-card { flex-direction: column !important; align-items: center !important; text-align: center !important; gap: 10px !important; padding: 22px 12px !important; }
          .wn-intent-arrow { display: none !important; }
          .wn-intent-hint { text-align: center !important; }
          .wn-container { max-width: 900px !important; }
          .wn-hero { margin-bottom: 22px !important; }
          .wn-input-card { padding: 22px !important; }
        }
      `}</style>

      {/* Soft decorative background blobs, purely cosmetic */}
      <div style={styles.blobTop} aria-hidden="true" />
      <div style={styles.blobBottom} aria-hidden="true" />

      <div style={styles.container} className="wn-container">
        <header style={styles.headerRow}>
          <div style={styles.logoRow}>
            <div style={styles.logoMark}>?</div>
            <span style={styles.logoWordmark}>
              What <span style={{ color: colors.teal }}>Now?</span>
            </span>
          </div>
          <button
            className="wn-theme"
            style={styles.themeToggle}
            onClick={() => setIsDark((d) => !d)}
          >
            <span>{isDark ? "☀️" : "🌙"}</span>
            <span>{isDark ? "Light mode" : "Dark mode"}</span>
          </button>
        </header>

        {step === "input" && (
          <>
            <div style={styles.hero} className="wn-hero">
              <h1 style={styles.heroHeadline}>Something confusing?</h1>
              <h2 style={styles.heroSub}>I'll make it clear.</h2>
              <p style={styles.heroText} className="wn-hero-text">
                Paste a message, upload a screenshot, or add a document.
              </p>
            </div>

            <div style={styles.inputCard} className="wn-input-card">
              <div style={styles.tabRow} role="tablist">
                <button
                  className="wn-tab"
                  role="tab"
                  aria-selected={mode === "text"}
                  onClick={() => setMode("text")}
                  style={{ ...styles.tab, ...(mode === "text" ? styles.tabActive : {}) }}
                >
                  <span>💬</span> Text
                </button>
                <button
                  className="wn-tab"
                  role="tab"
                  aria-selected={mode === "image"}
                  onClick={() => setMode("image")}
                  style={{ ...styles.tab, ...(mode === "image" ? styles.tabActive : {}) }}
                >
                  <span>🖼️</span> Screenshot
                </button>
                <button
                  className="wn-tab"
                  role="tab"
                  aria-selected={mode === "document"}
                  onClick={() => setMode("document")}
                  style={{ ...styles.tab, ...(mode === "document" ? styles.tabActive : {}) }}
                >
                  <span>📄</span> Document
                </button>
              </div>

              {mode === "text" && (
                <textarea
                  className="wn-textarea"
                  style={styles.textarea}
                  placeholder="Paste your confusing message here..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={6}
                />
              )}

              {mode === "image" && (
                <div
                  className="wn-drop"
                  tabIndex={0}
                  style={styles.dropzone}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("dragging");
                  }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("dragging")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("dragging");
                    handleImageFile(e.dataTransfer.files[0]);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => handleImageFile(e.target.files[0])}
                  />
                  {image ? (
                    <div style={styles.previewWrap}>
                      <img src={image.previewUrl} alt="Uploaded screenshot" style={styles.previewImg} />
                      <div style={styles.previewName}>{image.name}</div>
                      <button
                        style={styles.smallLinkBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setImage(null);
                        }}
                      >
                        Remove image
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={styles.dropIcon}>＋</div>
                      <div style={styles.dropText}>Tap to upload a screenshot</div>
                      <div style={styles.dropSubtext}>or drag an image here</div>
                    </>
                  )}
                </div>
              )}

              {mode === "document" && (
                <div
                  className="wn-drop"
                  tabIndex={0}
                  style={styles.dropzone}
                  onClick={() => docInputRef.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && docInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("dragging");
                  }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("dragging")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("dragging");
                    handleDocumentFile(e.dataTransfer.files[0]);
                  }}
                >
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    style={{ display: "none" }}
                    onChange={(e) => handleDocumentFile(e.target.files[0])}
                  />
                  {document ? (
                    <div style={styles.previewWrap}>
                      <div style={styles.docBadge}>{document.ext.toUpperCase()}</div>
                      <div style={styles.previewName}>{document.name}</div>
                      <button
                        style={styles.smallLinkBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDocument(null);
                        }}
                      >
                        Remove document
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={styles.dropIcon}>＋</div>
                      <div style={styles.dropText}>Tap to upload a document</div>
                      <div style={styles.dropSubtext}>PDF, DOCX, or TXT</div>
                    </>
                  )}
                </div>
              )}

              <div style={styles.toolRow}>
                <div style={styles.toolIcons}>
                  <button
                    type="button"
                    className="wn-tool"
                    style={styles.toolBtn}
                    title="Attach a screenshot"
                    onClick={() => setMode("image")}
                  >
                    📎
                  </button>
                  <button type="button" className="wn-tool" style={styles.toolBtn} title="Voice input — coming soon" disabled>
                    🎤
                  </button>
                  <button type="button" className="wn-tool" style={styles.toolBtn} title="Powered by AI" disabled>
                    ✨
                  </button>
                </div>
                <button
                  className="wn-btn"
                  style={{ ...styles.primaryBtn, ...(!hasInput ? styles.btnDisabled : {}) }}
                  disabled={!hasInput || loading}
                  onClick={runSelectedIntent}
                >
                  Continue →
                </button>
              </div>

              {error && <div style={styles.errorBox}>{error}</div>}

              <div style={styles.exampleWrap}>
                <div style={styles.exampleLabel}>Or try an example</div>
                <div style={styles.chipRow}>
                  {EXAMPLES.map((ex) => (
                    <button key={ex.id} className="wn-chip" style={styles.chip} onClick={() => loadExample(ex)}>
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={styles.intentSection}>
              <h3 style={styles.intentHeading}>What do you want to know?</h3>
              <div className="wn-intent-list">
                {INTENTS.map((intent) => {
                  const accent = INTENT_ACCENTS[intent.id][isDark ? "dark" : "light"];
                  const selected = selectedIntentId === intent.id;
                  return (
                    <button
                      key={intent.id}
                      type="button"
                      className="wn-intent wn-action"
                      onClick={() => setSelectedIntentId(intent.id)}
                      style={{
                        ...styles.intentCard,
                        borderColor: selected ? accent.c : colors.line,
                        background: selected ? accent.s : colors.paperRaised,
                      }}
                      aria-pressed={selected}
                    >
                      <span style={{ ...styles.intentIcon, color: accent.c, background: accent.s }}>
                        {intent.icon}
                      </span>
                      <span style={styles.intentText}>
                        <strong style={{ color: accent.c }}>{intent.label}</strong>
                        <span style={styles.intentHint}>{intent.hint}</span>
                      </span>
                      <span className="wn-intent-arrow" style={{ color: accent.c }}>→</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={styles.footerTagline}>
              ✨ We make confusing things clear, so you can move forward with confidence.
            </div>
          </>
        )}

        {step === "result" && result && (
          <div style={styles.results}>
            <ResultCard styles={styles} eyebrow="WHAT HAPPENED" accent={colors.teal} accentSoft={colors.tealSoft}>
              <p style={styles.meaningText}>{result.whatHappened}</p>
            </ResultCard>

            <ResultCard styles={styles} eyebrow="WHAT NOW?" accent={colors.ink} accentSoft={colors.inkSoft2} delay={0.06}>
              <ol style={styles.actionList}>
                {(result.actions || []).map((a, i) => (
                  <li key={i} style={styles.actionItem}>
                    <span style={styles.actionNum}>{i + 1}</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </ResultCard>

            {result.watchouts && result.watchouts.length > 0 && (
              <ResultCard styles={styles} eyebrow="⚠️ WATCH OUT" accent={colors.amber} accentSoft={colors.amberSoft} delay={0.12}>
                <ul style={styles.watchList}>
                  {result.watchouts.map((w, i) => (
                    <li key={i} style={styles.watchItem}>
                      {w}
                    </li>
                  ))}
                </ul>
              </ResultCard>
            )}

            {result.needsResponse && result.suggestedResponse && (
              <ResultCard styles={styles} eyebrow="💬 REPLY" accent={colors.teal} accentSoft={colors.tealSoft} delay={0.18}>
                <textarea
                  style={styles.responseBox}
                  value={result.suggestedResponse}
                  onChange={(e) => setResult({ ...result, suggestedResponse: e.target.value })}
                  rows={4}
                />
                <button style={styles.copyBtn} onClick={copyResponse}>
                  {copied ? "Copied" : "Copy reply"}
                </button>
              </ResultCard>
            )}

            <div style={styles.disclaimer}>
              This gives you a fast, plain read — not legal, medical, or financial advice. For
              anything with real stakes, double-check with a professional.
            </div>

            <button style={styles.secondaryBtn} onClick={askSomethingElse}>
              Ask something else about this
            </button>
            <button style={styles.tertiaryBtn} onClick={startOver}>
              Start over
            </button>
          </div>
        )}
      </div>

      {/* Mobile-only bottom nav, matches the reference phone mock */}
      <div style={styles.bottomNav} className="wn-bottomnav">
        <button style={styles.navItem} onClick={startOver}>
          <span style={styles.navIcon}>🏠</span>
          <span>Home</span>
        </button>
        <button style={styles.navFab} onClick={startOver} aria-label="Start a new check">
          +
        </button>
        <button style={styles.navItem} onClick={() => setShowAbout(true)}>
          <span style={styles.navIcon}>ℹ️</span>
          <span>About</span>
        </button>
      </div>

      {showAbout && (
        <div style={styles.aboutOverlay} onClick={() => setShowAbout(false)}>
          <div style={styles.aboutCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.aboutTitle}>About What Now?</div>
            <p style={styles.aboutText}>
              Paste a confusing message, screenshot, or document, tell us what you need, and
              get a fast, plain answer with clear next steps. No accounts, no clutter — just
              understand it and know what to do.
            </p>
            <button style={styles.aboutClose} onClick={() => setShowAbout(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ eyebrow, accent, accentSoft, children, delay = 0, styles }) {
  return (
    <div className="wn-card" style={{ ...styles.resultCard, borderLeft: `4px solid ${accent}`, animationDelay: `${delay}s` }}>
      <div style={{ ...styles.resultEyebrow, color: accent, background: accentSoft }}>{eyebrow}</div>
      {children}
    </div>
  );
}

const lightColors = {
  paper: "#F5F3FC",
  paperRaised: "#FFFFFF",
  ink: "#17152A",
  inkSoft: "#6B6980",
  inkSoft2: "#3D3A52",
  line: "#E5E1F5",
  teal: "#6D4AFF", // primary purple accent (kept the "teal" key name to limit refactor surface)
  tealSoft: "#EEEAFC",
  amber: "#DC5B2E",
  amberSoft: "#FCEBE3",
};

const darkColors = {
  paper: "#141225",
  paperRaised: "#1E1B33",
  ink: "#F1EFFB",
  inkSoft: "#A7A3C2",
  inkSoft2: "#D8D5EE",
  line: "#332F52",
  teal: "#A78BFA",
  tealSoft: "#2B2650",
  amber: "#F0916B",
  amberSoft: "#3A2A20",
};

function buildStyles(colors) {
  return {
    page: {
      minHeight: "100vh",
      width: "100%",
      background: colors.paper,
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: colors.ink,
      padding: "18px 14px 80px",
      position: "relative",
      overflowX: "hidden",
      transition: "background 0.2s ease, color 0.2s ease",
    },
    blobTop: {
      position: "absolute",
      top: -60,
      left: -60,
      width: 220,
      height: 220,
      borderRadius: "50%",
      background: colors.tealSoft,
      filter: "blur(50px)",
      opacity: 0.7,
      pointerEvents: "none",
      zIndex: 0,
    },
    blobBottom: {
      position: "absolute",
      top: 260,
      right: -70,
      width: 200,
      height: 200,
      borderRadius: "50%",
      background: colors.tealSoft,
      filter: "blur(55px)",
      opacity: 0.5,
      pointerEvents: "none",
      zIndex: 0,
    },
    container: {
      maxWidth: 900,
      margin: "0 auto",
      position: "relative",
      zIndex: 1,
    },
    headerRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 22,
    },
    logoRow: { display: "flex", alignItems: "center", gap: 9 },
    logoMark: {
      width: 30,
      height: 30,
      borderRadius: 8,
      background: colors.teal,
      color: "#FFFFFF",
      fontFamily: "'Fraunces', serif",
      fontWeight: 600,
      fontSize: 16,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    logoWordmark: {
      fontFamily: "'Fraunces', serif",
      fontWeight: 600,
      fontSize: 19,
      color: colors.ink,
      letterSpacing: "-0.01em",
    },
    themeToggle: {
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 14px",
      borderRadius: 100,
      border: `1px solid ${colors.line}`,
      background: colors.paperRaised,
      fontSize: 12.5,
      fontWeight: 500,
      color: colors.inkSoft,
      cursor: "pointer",
    },
    hero: { marginBottom: 20, paddingRight: 8 },
    heroHeadline: {
      fontFamily: "'Fraunces', serif",
      fontSize: 28,
      fontWeight: 600,
      margin: 0,
      lineHeight: 1.12,
      letterSpacing: "-0.01em",
      color: colors.ink,
    },
    heroSub: {
      fontFamily: "'Fraunces', serif",
      fontSize: 28,
      fontWeight: 600,
      margin: "1px 0 10px",
      lineHeight: 1.12,
      letterSpacing: "-0.01em",
      color: colors.teal,
    },
    heroText: { fontSize: 13.5, lineHeight: 1.45, color: colors.inkSoft, margin: 0, maxWidth: 440 },
    inputCard: {
      background: colors.paperRaised,
      border: `1px solid ${colors.line}`,
      borderRadius: 14,
      padding: 16,
      boxShadow: "0 8px 24px rgba(109,74,255,0.06)",
    },
    tabRow: { display: "flex", gap: 4, background: colors.paper, padding: 4, borderRadius: 100, marginBottom: 14 },
    tab: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "9px 6px",
      fontSize: 12.5,
      fontWeight: 500,
      fontFamily: "'Inter', sans-serif",
      border: "none",
      borderRadius: 100,
      background: "transparent",
      color: colors.inkSoft,
      cursor: "pointer",
    },
    tabActive: { background: colors.tealSoft, color: colors.teal, fontWeight: 600 },
    textarea: {
      width: "100%",
      border: `1px solid ${colors.line}`,
      borderRadius: 12,
      padding: 14,
      fontSize: 14,
      fontFamily: "'Inter', sans-serif",
      lineHeight: 1.5,
      color: colors.ink,
      resize: "vertical",
      background: colors.paper,
    },
    dropzone: {
      border: `1.5px dashed ${colors.line}`,
      borderRadius: 12,
      padding: "28px 16px",
      textAlign: "center",
      cursor: "pointer",
      background: colors.paper,
      minHeight: 140,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    },
    dropIcon: { fontSize: 22, color: colors.teal, marginBottom: 6 },
    dropText: { fontSize: 14.5, fontWeight: 500, color: colors.ink },
    dropSubtext: { fontSize: 12.5, color: colors.inkSoft, marginTop: 2 },
    previewWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
    previewImg: { maxHeight: 140, maxWidth: "100%", borderRadius: 8, border: `1px solid ${colors.line}` },
    docBadge: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 12,
      fontWeight: 500,
      color: colors.teal,
      background: colors.tealSoft,
      borderRadius: 6,
      padding: "6px 12px",
      letterSpacing: "0.05em",
    },
    previewName: { fontSize: 12, color: colors.inkSoft },
    smallLinkBtn: { background: "none", border: "none", color: colors.amber, fontSize: 12.5, cursor: "pointer", textDecoration: "underline", padding: 0 },
    toolRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 },
    toolIcons: { display: "flex", gap: 6 },
    toolBtn: {
      width: 38,
      height: 38,
      borderRadius: 10,
      border: `1px solid ${colors.line}`,
      background: colors.paper,
      fontSize: 15,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
    },
    errorBox: { marginTop: 10, fontSize: 13, color: colors.amber, background: colors.amberSoft, borderRadius: 8, padding: "9px 12px" },
    primaryBtn: {
      padding: "11px 19px",
      background: colors.teal,
      color: "#FFFFFF",
      border: "none",
      borderRadius: 10,
      fontSize: 14.5,
      fontWeight: 600,
      fontFamily: "'Inter', sans-serif",
      cursor: "pointer",
      whiteSpace: "nowrap",
    },
    btnDisabled: { opacity: 0.4, cursor: "not-allowed" },
    scanWrap: { position: "relative", height: 2, overflow: "hidden", marginTop: 8, borderRadius: 2 },
    scanline: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 2,
      background: `linear-gradient(90deg, transparent, ${colors.teal}, transparent)`,
      animation: "wn-scan 1.3s ease-in-out infinite",
    },
    loadingText: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: "0.06em", color: colors.teal, textAlign: "center", marginTop: 14 },
    exampleWrap: { marginTop: 18, paddingTop: 16, borderTop: `1px solid ${colors.line}` },
    exampleLabel: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.1em", color: colors.inkSoft, marginBottom: 9 },
    chipRow: { display: "flex", flexWrap: "wrap", gap: 8 },
    chip: {
      padding: "7px 12px",
      fontSize: 13,
      fontFamily: "'Inter', sans-serif",
      border: `1px solid ${colors.line}`,
      borderRadius: 100,
      background: colors.paper,
      color: colors.ink,
      cursor: "pointer",
    },
    footerTagline: {
      textAlign: "center",
      fontSize: 12.5,
      color: colors.inkSoft,
      marginTop: 20,
      lineHeight: 1.5,
      padding: "0 20px",
    },
    backLink: { background: "none", border: "none", color: colors.inkSoft, fontSize: 13, fontFamily: "'Inter', sans-serif", cursor: "pointer", padding: 0, marginBottom: 16 },
    intentHeading: { fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, margin: "0 0 12px", color: colors.ink, textAlign: "center" },
    intentSub: { fontSize: 13.5, color: colors.inkSoft, marginBottom: 18, textAlign: "center" },
    intentSection: { marginTop: 22 },
    intentList: { display: "flex", flexDirection: "column", gap: 9 },
    intentCard: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      width: "100%",
      textAlign: "left",
      padding: "13px 15px",
      border: `1px solid ${colors.line}`,
      borderRadius: 12,
      background: colors.paperRaised,
      cursor: "pointer",
    },
    intentIcon: { width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 },
    intentText: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 },
    intentLabel: { fontSize: 15, fontWeight: 600, fontFamily: "'Inter', sans-serif" },
    intentHint: { fontSize: 12.5, color: colors.inkSoft },
    intentArrow: { fontSize: 16, flexShrink: 0 },
    spinner: { width: 16, height: 16, borderRadius: "50%", border: `2px solid ${colors.tealSoft}`, flexShrink: 0 },
    results: { display: "flex", flexDirection: "column", gap: 14 },
    resultCard: { background: colors.paperRaised, borderRadius: 12, padding: "16px 18px 18px", border: `1px solid ${colors.line}` },
    resultEyebrow: { display: "inline-block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", fontWeight: 500, padding: "3px 8px", borderRadius: 5, marginBottom: 11 },
    meaningText: { fontSize: 15.5, lineHeight: 1.6, margin: 0, color: colors.ink },
    actionList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 11 },
    actionItem: { display: "flex", gap: 11, fontSize: 15, lineHeight: 1.5, color: colors.ink },
    actionNum: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 12.5,
      fontWeight: 500,
      color: colors.teal,
      background: colors.tealSoft,
      borderRadius: 5,
      minWidth: 20,
      height: 20,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      marginTop: 1,
    },
    watchList: { margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 8 },
    watchItem: { fontSize: 15, lineHeight: 1.5, color: colors.ink },
    responseBox: {
      width: "100%",
      border: `1px solid ${colors.line}`,
      borderRadius: 8,
      padding: 12,
      fontSize: 14.5,
      fontFamily: "'Inter', sans-serif",
      lineHeight: 1.5,
      color: colors.ink,
      background: colors.paper,
      resize: "vertical",
    },
    copyBtn: {
      marginTop: 10,
      padding: "8px 14px",
      fontSize: 13,
      fontWeight: 500,
      border: `1px solid ${colors.teal}`,
      color: colors.teal,
      background: colors.tealSoft,
      borderRadius: 8,
      cursor: "pointer",
    },
    disclaimer: { fontSize: 12, color: colors.inkSoft, textAlign: "center", lineHeight: 1.5, padding: "2px 12px" },
    secondaryBtn: { width: "100%", padding: "12px 16px", background: colors.ink, border: "none", borderRadius: 10, fontSize: 14.5, fontWeight: 600, color: colors.paper, cursor: "pointer" },
    tertiaryBtn: { width: "100%", padding: "12px 16px", background: "transparent", border: `1px solid ${colors.line}`, borderRadius: 10, fontSize: 14.5, fontWeight: 500, color: colors.ink, cursor: "pointer" },
    bottomNav: {
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-around",
      background: colors.paperRaised,
      borderTop: `1px solid ${colors.line}`,
      padding: "10px 20px calc(10px + env(safe-area-inset-bottom))",
      zIndex: 5,
    },
    navItem: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2,
      background: "none",
      border: "none",
      color: colors.inkSoft,
      fontSize: 11,
      fontWeight: 500,
      cursor: "pointer",
    },
    navIcon: { fontSize: 18 },
    navFab: {
      width: 48,
      height: 48,
      borderRadius: "50%",
      background: colors.teal,
      color: "#FFFFFF",
      border: "none",
      fontSize: 24,
      lineHeight: 1,
      marginTop: -22,
      boxShadow: "0 8px 18px rgba(109,74,255,0.35)",
      cursor: "pointer",
    },
    aboutOverlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(20,18,37,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      zIndex: 10,
    },
    aboutCard: {
      background: colors.paperRaised,
      borderRadius: 16,
      padding: 22,
      maxWidth: 360,
      width: "100%",
      border: `1px solid ${colors.line}`,
    },
    aboutTitle: { fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 600, color: colors.ink, marginBottom: 8 },
    aboutText: { fontSize: 14, lineHeight: 1.55, color: colors.inkSoft, margin: "0 0 16px" },
    aboutClose: {
      width: "100%",
      padding: "11px 16px",
      background: colors.teal,
      color: "#FFFFFF",
      border: "none",
      borderRadius: 10,
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
    },
  };
}
