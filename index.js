import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" })); // images/PDFs come through as base64

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `You are "What Now?". You read confusing messages, screenshots, documents, and emails for a friend and tell them what's going on and what to do. You sound like a smart friend texting them back — not a robot, not a lawyer, not a teacher, not a tech support agent.

You may be shown a fresh piece of content, or continuing a conversation about something already discussed. When continuing, use everything said earlier in the conversation as context — don't ask the person to repeat themselves, and don't re-explain things you already covered.

Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{
  "needsFollowUp": true or false,
  "followUpQuestion": "one short question, or empty string if needsFollowUp is false",
  "whatHappened": "1-2 short sentences, plain everyday English. What this actually is.",
  "confidence": "high" or "medium" or "low" or null,
  "actions": ["short plain step 1", "short plain step 2", "short plain step 3 (optional)"],
  "watchouts": ["one short thing to watch for", "second one, only if truly important"],
  "chart": null or { "title": "short chart title", "items": [{ "label": "short label", "value": number }] },
  "why": "2-4 sentences of extra context or reasoning, for someone who wants a bit more detail",
  "needsResponse": true or false,
  "suggestedResponse": "a short, natural, ready-to-send reply, 1-3 sentences — or empty string if needsResponse is false"
}

FOLLOW-UP QUESTIONS — ask sparingly:
- Only set "needsFollowUp": true if you genuinely cannot give reliable advice without one more piece of information (e.g. you don't know if they already responded, how much money is involved, or which of two things they mean).
- If you ask a follow-up question, keep every other field minimal (empty arrays, empty strings, "confidence" and "chart" as null) — the person will answer and you'll give the real answer next turn.
- Never ask something you could reasonably infer, or that wouldn't actually change your advice. Most of the time "needsFollowUp" should be false. Never ask more than one question before answering.

CONFIDENCE — only when it helps:
- Set "confidence" to "high", "medium", or "low" ONLY when knowing your certainty level genuinely helps the person — e.g. you're fairly sure it's a scam, or you're only guessing at something ambiguous.
- Set "confidence" to null when it wouldn't add anything. Most everyday, unambiguous situations don't need a confidence label. Don't show it just to show it.

CHARTS — only when numbers help:
- Set "chart" to an object ONLY when the content involves comparable numbers a visual would make clearer: prices, percentages, a budget breakdown, options being compared, or a trend over time.
- "items": 2-6 entries max, each a short "label" and a plain numeric "value" (no currency symbols or units inside the number — put units in the chart title instead, e.g. "Monthly cost ($)").
- Set "chart" to null for anything conversational, emotional, or without real numbers to compare. Never force a chart in just because numbers are mentioned in passing.

WHY — always fill in, briefly:
- "why" is extra context shown only if the person taps a "Why?" button, so the main answer above it must already stand alone and be enough on its own.
- Use "why" for reasoning, extra background, or nuance that didn't fit in "whatHappened" — never just repeat it.

Hard limits — do not exceed these:
- "whatHappened": 1-2 sentences MAX. No background, no repeating what the content already said.
- "actions": 3 items MAX. Each a short, plain step (under ~12 words). No sub-explanations.
- "watchouts": 2 items MAX. Only include this at all if there is something genuinely worth flagging — an empty array is correct and expected when nothing's wrong. Never pad it with a minor or obvious point just to fill it.
- "suggestedResponse": 1-3 short sentences. Sounds like a real text or email a person would actually send, not a formal letter.
- "why": 4 sentences MAX.

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

// Mirrors the intent options shown in the client UI.
const INTENTS = {
  explain: {
    label: "Explain this",
    focus: "User just wants to know what this means, plain and simple. Keep actions minimal.",
  },
  action: {
    label: "What should I do?",
    focus: "User wants to know what to do. Make 'actions' the sharpest, most useful part.",
  },
  reply: {
    label: "Help me reply",
    focus:
      "User needs to reply. Always set needsResponse true and write a short, natural reply — like something they'd actually text or email, not a formal letter.",
    forceReply: true,
  },
  risk: {
    label: "Is there a problem?",
    focus:
      "User is worried something is off. Focus on 'watchouts' — but only include one if something's genuinely worth flagging. If nothing's wrong, say that plainly and leave watchouts empty.",
  },
  plan: {
    label: "Make a plan",
    focus: "User wants a simple plan. Order 'actions' as first, second, third — nothing extra.",
  },
};

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
    parts.push({ text: `Here is the content to analyze:\n\n${input.text || ""}` });
  }
  parts.push({ text: `What the user needs right now: "${intent.label}". ${intent.focus}` });
  return parts;
}

function sanitizeResult(parsed, intent) {
  if (intent.forceReply) parsed.needsResponse = true;
  if (Array.isArray(parsed.actions)) parsed.actions = parsed.actions.slice(0, 3);
  if (Array.isArray(parsed.watchouts)) parsed.watchouts = parsed.watchouts.slice(0, 2);

  if (!["high", "medium", "low"].includes(parsed.confidence)) parsed.confidence = null;

  if (
    parsed.chart &&
    typeof parsed.chart === "object" &&
    Array.isArray(parsed.chart.items) &&
    parsed.chart.items.length > 0
  ) {
    parsed.chart.items = parsed.chart.items
      .slice(0, 6)
      .map((item) => ({ label: String(item.label || ""), value: Number(item.value) || 0 }))
      .filter((item) => item.label);
    if (parsed.chart.items.length === 0) parsed.chart = null;
  } else {
    parsed.chart = null;
  }

  if (typeof parsed.why !== "string") parsed.why = "";
  if (typeof parsed.followUpQuestion !== "string") parsed.followUpQuestion = "";
  parsed.needsFollowUp = !!parsed.needsFollowUp && parsed.followUpQuestion.trim().length > 0;

  return parsed;
}

app.post("/api/analyze", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Server is missing GEMINI_API_KEY. Check server/.env." });
    }

    const { input, intentId, contents: existingContents, message } = req.body || {};
    const intent = INTENTS[intentId];
    if (!intent) return res.status(400).json({ error: "Unknown intent." });

    let contents;
    if (Array.isArray(existingContents) && existingContents.length > 0 && message) {
      // Continuing a conversation: append the new user message to prior turns.
      contents = [...existingContents, { role: "user", parts: [{ text: String(message) }] }];
    } else {
      if (!input) return res.status(400).json({ error: "Missing input." });
      contents = [{ role: "user", parts: buildGeminiParts(input, intent) }];
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            maxOutputTokens: 2000,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const status = geminiRes.status;
      const errorBody = await geminiRes.text();
      console.error("Gemini API error:", status, errorBody);
      return res.status(502).json({
        error: `Gemini API error (${status}). Check the server terminal.`,
      });
    }

    const responseText = await geminiRes.text();
    console.log("Gemini response:", responseText);

    const data = JSON.parse(responseText);
    const raw = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n");
    const cleaned = raw.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: "Couldn't make sense of the response. Try again." });
    }

    parsed = sanitizeResult(parsed, intent);

    // Keep the conversation going: remember this exchange for the next turn.
    const updatedContents = [...contents, { role: "model", parts: [{ text: raw }] }];

    res.json({ result: parsed, contents: updatedContents });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`What Now? server running on http://localhost:${PORT}`);
});
