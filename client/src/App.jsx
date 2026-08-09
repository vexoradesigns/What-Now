import React, { useState, useRef, useCallback } from "react";
import mammoth from "mammoth";

const API_BASE = import.meta.env.VITE_API_URL || "";

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
  {
    id: "planchoice",
    label: "Comparing plans",
    text: `I'm trying to decide between two internet plans:
Plan A: $45/month, 300 Mbps, 2-year contract
Plan B: $60/month, 500 Mbps, no contract
Plan C: $52/month, 400 Mbps, 1-year contract

Which one should I go with?`,
  },
];

const INTENTS = [
  { id: "explain", label: "Explain this", hint: "Break down what it actually means" },
  { id: "action", label: "What should I do?", hint: "Get clear next steps" },
  { id: "reply", label: "Help me reply", hint: "Draft a response for them" },
  { id: "risk", label: "Is there a problem?", hint: "Spot risks and red flags" },
  { id: "plan", label: "Make a plan", hint: "Turn this into a step-by-step plan" },
];

async function callAnalyze(payload) {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "The analysis request failed. Try again.");
  }
  return data; // { result, contents }
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

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [step, setStep] = useState("input"); // 'input' | 'intent' | 'clarify' | 'result'
  const [mode, setMode] = useState("text"); // 'text' | 'image' | 'document'
  const [textInput, setTextInput] = useState("");
  const [image, setImage] = useState(null); // { base64, mimeType, previewUrl, name }
  const [document, setDocument] = useState(null); // { kind: 'pdf'|'text', base64?, text?, name, ext }
  const [selectedIntentId, setSelectedIntentId] = useState(null);
  const [activeIntent, setActiveIntent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);

  // v5: conversation continuity
  const [contentsState, setContentsState] = useState(null);

  // v5: AI-initiated clarifying question
  const [clarifyQuestion, setClarifyQuestion] = useState("");
  const [clarifyAnswer, setClarifyAnswer] = useState("");
  const [clarifyLoading, setClarifyLoading] = useState(false);

  // v5: user-initiated follow-up chat
  const [followUps, setFollowUps] = useState([]);
  const [followUpInput, setFollowUpInput] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // v5: "Why?" expand state, keyed per answer ("main" or "f0", "f1", ...)
  const [whyOpen, setWhyOpen] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);

  const colors = isDark ? darkColors : lightColors;
  const styles = buildStyles(colors);

  const hasInput =
    mode === "text"
      ? textInput.trim().length > 0
      : mode === "image"
      ? !!image
      : !!document;

  const currentInput = { mode, text: textInput, image, document };

  const handleImageFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError("");
    const base64 = await fileToBase64(file);
    setImage({
      base64,
      mimeType: file.type,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
    });
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

  const goToIntent = () => {
    if (!hasInput) return;
    setError("");
    setStep("intent");
  };

  const loadExample = (ex) => {
    setResult(null);
    setError("");
    setImage(null);
    setDocument(null);
    setMode("text");
    setTextInput(ex.text);
    setStep("intent");
  };

  const resetConversationState = () => {
    setContentsState(null);
    setFollowUps([]);
    setFollowUpInput("");
    setWhyOpen({});
    setCopiedKey(null);
    setClarifyQuestion("");
    setClarifyAnswer("");
  };

  const startOver = () => {
    setResult(null);
    setError("");
    setTextInput("");
    setImage(null);
    setDocument(null);
    setSelectedIntentId(null);
    setActiveIntent(null);
    setMode("text");
    resetConversationState();
    setStep("input");
  };

  const askSomethingElse = () => {
    setResult(null);
    setError("");
    setSelectedIntentId(null);
    setActiveIntent(null);
    resetConversationState();
    setStep("intent");
  };

  const runAnalysis = useCallback(
    async (intent) => {
      setSelectedIntentId(intent.id);
      setActiveIntent(intent);
      setLoading(true);
      setError("");
      resetConversationState();
      try {
        const data = await callAnalyze({ input: currentInput, intentId: intent.id });
        setContentsState(data.contents);
        if (data.result.needsFollowUp && data.result.followUpQuestion) {
          setClarifyQuestion(data.result.followUpQuestion);
          setStep("clarify");
        } else {
          setResult(data.result);
          setStep("result");
        }
      } catch (e) {
        setError(e.message || "Something went wrong. Try again.");
        setStep("intent");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, textInput, image, document]
  );

  const submitClarifyAnswer = async () => {
    if (!clarifyAnswer.trim() || clarifyLoading) return;
    const answerText = clarifyAnswer.trim();
    setClarifyLoading(true);
    setError("");
    try {
      const data = await callAnalyze({
        contents: contentsState,
        message: answerText,
        intentId: activeIntent.id,
      });
      setContentsState(data.contents);
      setClarifyAnswer("");
      // Always show the result now — avoids looping on a second clarifying question.
      setResult(data.result);
      setStep("result");
    } catch (e) {
      setError(e.message || "Something went wrong. Try again.");
    } finally {
      setClarifyLoading(false);
    }
  };

  const submitFollowUp = async () => {
    if (!followUpInput.trim() || followUpLoading || !activeIntent) return;
    const q = followUpInput.trim();
    setFollowUpInput("");
    setFollowUpLoading(true);
    setError("");
    try {
      const data = await callAnalyze({
        contents: contentsState,
        message: q,
        intentId: activeIntent.id,
      });
      setContentsState(data.contents);
      setFollowUps((prev) => [...prev, { question: q, result: data.result }]);
    } catch (e) {
      setError(e.message || "Something went wrong. Try again.");
    } finally {
      setFollowUpLoading(false);
    }
  };

  const copyText = async (text, key) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch (e) {
      /* clipboard unavailable, ignore */
    }
  };

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .wn-textarea:focus, .wn-tab:focus-visible, .wn-btn:focus-visible, .wn-chip:focus-visible,
        .wn-drop:focus-visible, .wn-intent:focus-visible, .wn-theme:focus-visible {
          outline: 2px solid ${colors.teal}; outline-offset: 2px;
        }
        .wn-drop.dragging { border-color: ${colors.teal} !important; background: ${colors.tealSoft} !important; }
        .wn-intent { transition: border-color 0.15s ease, background 0.15s ease; }
        .wn-intent:hover:not(:disabled) { border-color: ${colors.teal}; background: ${colors.tealSoft}; }
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
        @keyframes wn-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes wn-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        .wn-card { animation: wn-fade-up 0.35s ease both; }
        .wn-spinner { animation: wn-spin 0.8s linear infinite; }
        .wn-loading-text { animation: wn-pulse 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .wn-scanline, .wn-card, .wn-spinner, .wn-loading-text { animation: none !important; }
        }
      `}</style>

      <div style={styles.container}>
        <header style={styles.headerRow}>
          <div>
            <div style={styles.eyebrow}>PLAIN-ENGLISH READS</div>
            <h1 style={styles.title}>What Now?</h1>
          </div>
          <button
            className="wn-theme"
            style={styles.themeToggle}
            onClick={() => setIsDark((d) => !d)}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? "☀️" : "🌙"}
          </button>
        </header>

        {step === "input" && (
          <div style={styles.inputCard}>
            <p style={styles.emptyState}>
              Give me something confusing. I'll help you understand it and figure out what
              to do next — try "I got this message, what now?" or "Should I buy this?"
            </p>

            <div style={styles.tabRow} role="tablist">
              <button
                className="wn-tab"
                role="tab"
                aria-selected={mode === "text"}
                onClick={() => setMode("text")}
                style={{ ...styles.tab, ...(mode === "text" ? styles.tabActive : {}) }}
              >
                ✍️ Text
              </button>
              <button
                className="wn-tab"
                role="tab"
                aria-selected={mode === "image"}
                onClick={() => setMode("image")}
                style={{ ...styles.tab, ...(mode === "image" ? styles.tabActive : {}) }}
              >
                📸 Screenshot
              </button>
              <button
                className="wn-tab"
                role="tab"
                aria-selected={mode === "document"}
                onClick={() => setMode("document")}
                style={{ ...styles.tab, ...(mode === "document" ? styles.tabActive : {}) }}
              >
                📄 Document
              </button>
            </div>

            {mode === "text" && (
              <textarea
                className="wn-textarea"
                style={styles.textarea}
                placeholder="Paste the email, text, letter, or chat here..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                rows={8}
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

            {error && <div style={styles.errorBox}>{error}</div>}

            <button
              className="wn-btn"
              style={{
                ...styles.primaryBtn,
                ...(hasInput ? {} : styles.btnDisabled),
              }}
              disabled={!hasInput}
              onClick={goToIntent}
            >
              Continue →
            </button>

            <div style={styles.exampleWrap}>
              <div style={styles.exampleLabel}>Or try an example</div>
              <div style={styles.chipRow}>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.id}
                    className="wn-chip"
                    style={styles.chip}
                    onClick={() => loadExample(ex)}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "intent" && (
          <div style={styles.inputCard}>
            <button style={styles.backLink} onClick={() => setStep("input")} disabled={loading}>
              ← Edit content
            </button>
            <div style={styles.intentHeading}>What do you need?</div>
            <div style={styles.intentSub}>Pick one — we'll focus the answer around it.</div>

            <div style={styles.intentList}>
              {INTENTS.map((intent) => {
                const isActive = loading && selectedIntentId === intent.id;
                return (
                  <button
                    key={intent.id}
                    className="wn-intent"
                    style={{
                      ...styles.intentCard,
                      ...(isActive ? styles.intentCardActive : {}),
                    }}
                    disabled={loading}
                    onClick={() => runAnalysis(intent)}
                  >
                    <div style={styles.intentText}>
                      <div style={styles.intentLabel}>{intent.label}</div>
                      <div style={styles.intentHint}>{intent.hint}</div>
                    </div>
                    {isActive ? (
                      <div className="wn-spinner" style={styles.spinner} />
                    ) : (
                      <div style={styles.intentArrow}>→</div>
                    )}
                  </button>
                );
              })}
            </div>

            {error && <div style={styles.errorBox}>{error}</div>}

            {loading && (
              <>
                <div className="wn-loading-text" style={styles.loadingText}>
                  Figuring it out…
                </div>
                <div style={styles.scanWrap}>
                  <div className="wn-scanline" style={styles.scanline} />
                </div>
              </>
            )}
          </div>
        )}

        {step === "clarify" && (
          <div style={styles.inputCard}>
            <button
              style={styles.backLink}
              onClick={() => setStep("intent")}
              disabled={clarifyLoading}
            >
              ← Back
            </button>
            <div style={styles.intentHeading}>Quick question</div>
            <div style={styles.intentSub}>{clarifyQuestion}</div>

            <textarea
              className="wn-textarea"
              style={styles.textarea}
              placeholder="Type your answer..."
              value={clarifyAnswer}
              onChange={(e) => setClarifyAnswer(e.target.value)}
              rows={3}
            />

            {error && <div style={styles.errorBox}>{error}</div>}

            <button
              className="wn-btn"
              style={{
                ...styles.primaryBtn,
                ...(clarifyAnswer.trim() ? {} : styles.btnDisabled),
              }}
              disabled={!clarifyAnswer.trim() || clarifyLoading}
              onClick={submitClarifyAnswer}
            >
              {clarifyLoading ? "Thinking…" : "Continue →"}
            </button>
          </div>
        )}

        {step === "result" && result && (
          <div style={styles.results}>
            <AnswerBody
              result={result}
              colors={colors}
              styles={styles}
              showWhy={!!whyOpen.main}
              onToggleWhy={() => setWhyOpen((w) => ({ ...w, main: !w.main }))}
              editable
              onEditResponse={(text) => setResult({ ...result, suggestedResponse: text })}
              onCopy={() => copyText(result.suggestedResponse, "main")}
              copied={copiedKey === "main"}
            />

            {followUps.map((f, i) => {
              const key = `f${i}`;
              return (
                <div key={key} style={styles.followUpBlock}>
                  <div style={styles.followUpQuestion}>{f.question}</div>
                  <AnswerBody
                    result={f.result}
                    colors={colors}
                    styles={styles}
                    showWhy={!!whyOpen[key]}
                    onToggleWhy={() => setWhyOpen((w) => ({ ...w, [key]: !w[key] }))}
                    editable={false}
                    onCopy={() => copyText(f.result.suggestedResponse, key)}
                    copied={copiedKey === key}
                  />
                </div>
              );
            })}

            <div style={styles.followUpInputRow}>
              <input
                style={styles.followUpInputBox}
                placeholder="Ask a follow-up, e.g. what if I already clicked it?"
                value={followUpInput}
                onChange={(e) => setFollowUpInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitFollowUp()}
                disabled={followUpLoading}
              />
              <button
                style={{
                  ...styles.followUpSendBtn,
                  ...(followUpLoading || !followUpInput.trim() ? styles.btnDisabled : {}),
                }}
                onClick={submitFollowUp}
                disabled={followUpLoading || !followUpInput.trim()}
              >
                {followUpLoading ? "…" : "Ask"}
              </button>
            </div>

            {error && <div style={styles.errorBox}>{error}</div>}

            <div style={styles.disclaimer}>
              This gives you a fast, plain read — not legal, medical, or financial advice.
              For anything with real stakes, double-check with a professional.
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
    </div>
  );
}

function AnswerBody({ result, colors, styles, showWhy, onToggleWhy, editable, onEditResponse, onCopy, copied }) {
  return (
    <>
      <ResultCard styles={styles} eyebrow="WHAT HAPPENED" accent={colors.teal} accentSoft={colors.tealSoft}>
        <div style={{ display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: 4 }}>
          <p style={{ ...styles.meaningText, flex: 1, minWidth: 180, margin: 0 }}>{result.whatHappened}</p>
          <ConfidenceBadge level={result.confidence} colors={colors} />
        </div>
        <SimpleChart chart={result.chart} colors={colors} />
        <WhySection why={result.why} colors={colors} isOpen={showWhy} onToggle={onToggleWhy} />
      </ResultCard>

      {result.actions && result.actions.length > 0 && (
        <ResultCard styles={styles} eyebrow="WHAT NOW?" accent={colors.ink} accentSoft={colors.inkSoft2} delay={0.06}>
          <ol style={styles.actionList}>
            {result.actions.map((a, i) => (
              <li key={i} style={styles.actionItem}>
                <span style={styles.actionNum}>{i + 1}</span>
                <span>{a}</span>
              </li>
            ))}
          </ol>
        </ResultCard>
      )}

      {result.watchouts && result.watchouts.length > 0 && (
        <ResultCard
          styles={styles}
          eyebrow="⚠️ WATCH OUT"
          accent={colors.amber}
          accentSoft={colors.amberSoft}
          delay={0.12}
        >
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
          {editable ? (
            <textarea
              style={styles.responseBox}
              value={result.suggestedResponse}
              onChange={(e) => onEditResponse(e.target.value)}
              rows={4}
            />
          ) : (
            <p style={{ ...styles.meaningText, whiteSpace: "pre-wrap", margin: 0 }}>{result.suggestedResponse}</p>
          )}
          <button style={styles.copyBtn} onClick={onCopy}>
            {copied ? "Copied" : "Copy reply"}
          </button>
        </ResultCard>
      )}
    </>
  );
}

function ConfidenceBadge({ level, colors }) {
  if (!level) return null;
  const map = {
    high: { label: "High confidence", color: colors.teal, bg: colors.tealSoft },
    medium: { label: "Medium confidence", color: colors.amber, bg: colors.amberSoft },
    low: { label: "Low confidence", color: colors.red, bg: colors.redSoft },
  };
  const cfg = map[level];
  if (!cfg) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: "0.05em",
        color: cfg.color,
        background: cfg.bg,
        borderRadius: 100,
        padding: "3px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

function SimpleChart({ chart, colors }) {
  if (!chart || !Array.isArray(chart.items) || chart.items.length === 0) return null;
  const max = Math.max(...chart.items.map((i) => Number(i.value) || 0), 1);
  return (
    <div style={{ marginTop: 14 }}>
      {chart.title && (
        <div style={{ fontSize: 12, fontWeight: 500, color: colors.inkSoft, marginBottom: 9 }}>{chart.title}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {chart.items.map((item, i) => {
          const pct = Math.max(4, (Number(item.value) || 0) / max * 100);
          return (
            <div key={i}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12.5,
                  color: colors.ink,
                  marginBottom: 3,
                }}
              >
                <span>{item.label}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: colors.inkSoft }}>{item.value}</span>
              </div>
              <div style={{ height: 8, background: colors.tealSoft, borderRadius: 5, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: colors.teal, borderRadius: 5 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WhySection({ why, colors, isOpen, onToggle }) {
  if (!why) return null;
  return (
    <div style={{ marginTop: 13 }}>
      <button
        onClick={onToggle}
        style={{
          background: "none",
          border: `1px solid ${colors.line}`,
          borderRadius: 100,
          padding: "5px 12px",
          fontSize: 12.5,
          fontFamily: "'Inter', sans-serif",
          color: colors.teal,
          cursor: "pointer",
        }}
      >
        {isOpen ? "Hide why" : "Why?"}
      </button>
      {isOpen && (
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: colors.inkSoft, marginTop: 9, marginBottom: 0 }}>
          {why}
        </p>
      )}
    </div>
  );
}

function ResultCard({ eyebrow, accent, accentSoft, children, delay = 0, styles }) {
  return (
    <div
      className="wn-card"
      style={{
        ...styles.resultCard,
        borderLeft: `4px solid ${accent}`,
        animationDelay: `${delay}s`,
      }}
    >
      <div style={{ ...styles.resultEyebrow, color: accent, background: accentSoft }}>{eyebrow}</div>
      {children}
    </div>
  );
}

const lightColors = {
  paper: "#F3F4EF",
  paperRaised: "#FFFFFF",
  ink: "#16211D",
  inkSoft: "#4B5750",
  inkSoft2: "#2E3833",
  line: "#DBDDD3",
  teal: "#2B6E62",
  tealSoft: "#E4EEEA",
  amber: "#B65A25",
  amberSoft: "#F3E2D2",
  red: "#B33A3A",
  redSoft: "#F5DEDE",
};

const darkColors = {
  paper: "#1B1F1C",
  paperRaised: "#242925",
  ink: "#EDEFE9",
  inkSoft: "#A6ADA3",
  inkSoft2: "#D7DBD2",
  line: "#383D37",
  teal: "#5FAE9B",
  tealSoft: "#26362F",
  amber: "#E0975E",
  amberSoft: "#3B2E20",
  red: "#E17878",
  redSoft: "#3B2323",
};

function buildStyles(colors) {
  return {
    page: {
      minHeight: "100vh",
      width: "100%",
      background: colors.paper,
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: colors.ink,
      padding: "28px 16px 60px",
      transition: "background 0.2s ease, color 0.2s ease",
    },
    container: {
      maxWidth: 560,
      margin: "0 auto",
    },
    headerRow: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 24,
    },
    themeToggle: {
      flexShrink: 0,
      width: 40,
      height: 40,
      borderRadius: 10,
      border: `1px solid ${colors.line}`,
      background: colors.paperRaised,
      fontSize: 17,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
    },
    eyebrow: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 11,
      letterSpacing: "0.14em",
      color: colors.teal,
      marginBottom: 8,
      fontWeight: 500,
    },
    title: {
      fontFamily: "'Fraunces', serif",
      fontSize: 40,
      fontWeight: 600,
      margin: 0,
      letterSpacing: "-0.01em",
      lineHeight: 1.05,
      color: colors.ink,
    },
    inputCard: {
      background: colors.paperRaised,
      border: `1px solid ${colors.line}`,
      borderRadius: 14,
      padding: 18,
    },
    emptyState: {
      fontSize: 14.5,
      lineHeight: 1.5,
      color: colors.inkSoft,
      margin: "0 0 16px",
    },
    tabRow: {
      display: "flex",
      gap: 4,
      background: colors.paper,
      padding: 4,
      borderRadius: 10,
      marginBottom: 14,
    },
    tab: {
      flex: 1,
      padding: "9px 6px",
      fontSize: 12.5,
      fontWeight: 500,
      fontFamily: "'Inter', sans-serif",
      border: "none",
      borderRadius: 8,
      background: "transparent",
      color: colors.inkSoft,
      cursor: "pointer",
    },
    tabActive: {
      background: colors.paperRaised,
      color: colors.ink,
      boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
    },
    textarea: {
      width: "100%",
      border: `1px solid ${colors.line}`,
      borderRadius: 10,
      padding: 14,
      fontSize: 15,
      fontFamily: "'Inter', sans-serif",
      lineHeight: 1.5,
      color: colors.ink,
      resize: "vertical",
      background: colors.paper,
    },
    dropzone: {
      border: `1.5px dashed ${colors.line}`,
      borderRadius: 10,
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
    dropIcon: {
      fontSize: 22,
      color: colors.teal,
      marginBottom: 6,
    },
    dropText: {
      fontSize: 14.5,
      fontWeight: 500,
      color: colors.ink,
    },
    dropSubtext: {
      fontSize: 12.5,
      color: colors.inkSoft,
      marginTop: 2,
    },
    previewWrap: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
    },
    previewImg: {
      maxHeight: 140,
      maxWidth: "100%",
      borderRadius: 8,
      border: `1px solid ${colors.line}`,
    },
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
    previewName: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    smallLinkBtn: {
      background: "none",
      border: "none",
      color: colors.amber,
      fontSize: 12.5,
      cursor: "pointer",
      textDecoration: "underline",
      padding: 0,
    },
    errorBox: {
      marginTop: 10,
      fontSize: 13,
      color: colors.amber,
      background: colors.amberSoft,
      borderRadius: 8,
      padding: "9px 12px",
    },
    primaryBtn: {
      width: "100%",
      marginTop: 14,
      padding: "13px 16px",
      background: colors.ink,
      color: colors.paper,
      border: "none",
      borderRadius: 10,
      fontSize: 15.5,
      fontWeight: 600,
      fontFamily: "'Inter', sans-serif",
      cursor: "pointer",
    },
    btnDisabled: {
      opacity: 0.4,
      cursor: "not-allowed",
    },
    scanWrap: {
      position: "relative",
      height: 2,
      overflow: "hidden",
      marginTop: 8,
      borderRadius: 2,
    },
    scanline: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 2,
      background: `linear-gradient(90deg, transparent, ${colors.teal}, transparent)`,
      animation: "wn-scan 1.3s ease-in-out infinite",
    },
    loadingText: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 12,
      letterSpacing: "0.06em",
      color: colors.teal,
      textAlign: "center",
      marginTop: 14,
    },
    exampleWrap: {
      marginTop: 18,
      paddingTop: 16,
      borderTop: `1px solid ${colors.line}`,
    },
    exampleLabel: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 11,
      letterSpacing: "0.1em",
      color: colors.inkSoft,
      marginBottom: 9,
    },
    chipRow: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
    },
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
    backLink: {
      background: "none",
      border: "none",
      color: colors.inkSoft,
      fontSize: 13,
      fontFamily: "'Inter', sans-serif",
      cursor: "pointer",
      padding: 0,
      marginBottom: 16,
    },
    intentHeading: {
      fontFamily: "'Fraunces', serif",
      fontSize: 22,
      fontWeight: 600,
      margin: "0 0 4px",
      color: colors.ink,
    },
    intentSub: {
      fontSize: 13.5,
      color: colors.inkSoft,
      marginBottom: 16,
    },
    intentList: {
      display: "flex",
      flexDirection: "column",
      gap: 9,
    },
    intentCard: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      width: "100%",
      textAlign: "left",
      padding: "13px 15px",
      border: `1px solid ${colors.line}`,
      borderRadius: 10,
      background: colors.paper,
      cursor: "pointer",
    },
    intentCardActive: {
      borderColor: colors.teal,
      background: colors.tealSoft,
    },
    intentText: {
      display: "flex",
      flexDirection: "column",
      gap: 2,
    },
    intentLabel: {
      fontSize: 15,
      fontWeight: 600,
      color: colors.ink,
      fontFamily: "'Inter', sans-serif",
    },
    intentHint: {
      fontSize: 12.5,
      color: colors.inkSoft,
    },
    intentArrow: {
      fontSize: 16,
      color: colors.teal,
      flexShrink: 0,
    },
    spinner: {
      width: 16,
      height: 16,
      borderRadius: "50%",
      border: `2px solid ${colors.tealSoft}`,
      borderTopColor: colors.teal,
      flexShrink: 0,
    },
    results: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
    },
    resultCard: {
      background: colors.paperRaised,
      borderRadius: 10,
      padding: "16px 18px 18px",
      border: `1px solid ${colors.line}`,
    },
    resultEyebrow: {
      display: "inline-block",
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 10.5,
      letterSpacing: "0.1em",
      fontWeight: 500,
      padding: "3px 8px",
      borderRadius: 5,
      marginBottom: 11,
    },
    meaningText: {
      fontSize: 15.5,
      lineHeight: 1.6,
      margin: 0,
      color: colors.ink,
    },
    actionList: {
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "flex",
      flexDirection: "column",
      gap: 11,
    },
    actionItem: {
      display: "flex",
      gap: 11,
      fontSize: 15,
      lineHeight: 1.5,
      color: colors.ink,
    },
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
    watchList: {
      margin: 0,
      padding: "0 0 0 18px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    },
    watchItem: {
      fontSize: 15,
      lineHeight: 1.5,
      color: colors.ink,
    },
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
    disclaimer: {
      fontSize: 12,
      color: colors.inkSoft,
      textAlign: "center",
      lineHeight: 1.5,
      padding: "2px 12px",
    },
    secondaryBtn: {
      width: "100%",
      padding: "12px 16px",
      background: colors.ink,
      border: "none",
      borderRadius: 10,
      fontSize: 14.5,
      fontWeight: 600,
      color: colors.paper,
      cursor: "pointer",
    },
    tertiaryBtn: {
      width: "100%",
      padding: "12px 16px",
      background: "transparent",
      border: `1px solid ${colors.line}`,
      borderRadius: 10,
      fontSize: 14.5,
      fontWeight: 500,
      color: colors.ink,
      cursor: "pointer",
    },
    followUpBlock: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      paddingTop: 4,
    },
    followUpQuestion: {
      alignSelf: "flex-end",
      background: colors.ink,
      color: colors.paper,
      fontSize: 13.5,
      lineHeight: 1.4,
      padding: "9px 14px",
      borderRadius: "14px 14px 4px 14px",
      maxWidth: "85%",
    },
    followUpInputRow: {
      display: "flex",
      gap: 8,
      marginTop: 2,
    },
    followUpInputBox: {
      flex: 1,
      border: `1px solid ${colors.line}`,
      borderRadius: 10,
      padding: "10px 12px",
      fontSize: 14,
      fontFamily: "'Inter', sans-serif",
      color: colors.ink,
      background: colors.paperRaised,
    },
    followUpSendBtn: {
      padding: "10px 18px",
      background: colors.ink,
      color: colors.paper,
      border: "none",
      borderRadius: 10,
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      flexShrink: 0,
    },
  };
}
