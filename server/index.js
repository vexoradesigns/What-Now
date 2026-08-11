import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `You are "What Now?". You read confusing messages, screenshots, documents, and emails for a friend and tell them what's going on and what to do.

You sound like a smart friend texting them back — not a robot, not a lawyer, not a teacher, not a tech support agent.

Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:

{
  "needsFollowUp": true or false,
  "followUpQuestion": "one short question, or empty string if needsFollowUp is false",
  "whatHappened": "1-2 short sentences, plain everyday English. What this actually is.",
  "confidence": "high" or "medium" or "low" or null,
  "actions": ["short plain step 1", "short plain step 2", "short plain step 3"],
  "watchouts": ["one short thing to watch for", "second one, only if truly important"],
  "chart": null or {
    "title": "short chart title",
    "items": [
      {
        "label": "short label",
        "value": number
      }
    ]
  },
  "why": "2-4 sentences of extra context or reasoning",
  "needsResponse": true or false,
  "suggestedResponse": "a short, natural, ready-to-send reply, 1-3 sentences — or empty string if needsResponse is false"
}

Rules:

- Use simple everyday English.
- Explain what is actually happening.
- Mention important subtext when relevant.
- Give concrete actions.
- Never invent names, dates, amounts, or facts.
- Keep answers short and useful.
- Only include watchouts when there is a real risk.
- Only include a chart when numbers genuinely need comparison.
- Only set needsResponse to true when a reply would actually make sense.
- The suggested response should sound natural and human.
- Never ask for passwords, OTPs, private keys, or other sensitive credentials.
- If something is unclear, say so instead of guessing.`;

const INTENTS = {
  explain: {
    label: "Explain",
    focus: "The user wants to understand what this means.",
  },

  action: {
    label: "Act",
    focus: "The user wants to know exactly what they should do next.",
  },

  reply: {
    label: "Reply",
    focus:
      "The user wants help replying. Always provide a short natural reply.",
    forceReply: true,
  },

  risk: {
    label: "Risk",
    focus:
      "The user wants to know whether there is a problem, risk, deadline, scam, or trap.",
  },

  plan: {
    label: "Plan",
    focus:
      "The user wants a simple step-by-step plan for what to do next.",
  },
};

function buildGeminiParts(input, intent) {
  const parts = [];

  if (input.mode === "image" && input.image) {
    parts.push({
      inlineData: {
        mimeType: input.image.mimeType,
        data: input.image.base64,
      },
    });

    parts.push({
      text: "Here is a screenshot or image. Analyze it according to your instructions.",
    });
  } else if (input.mode === "document" && input.document) {
    if (input.document.kind === "pdf") {
      parts.push({
        inlineData: {
          mimeType: "application/pdf",
          data: input.document.base64,
        },
      });

      parts.push({
        text: "Here is a PDF document. Analyze it according to your instructions.",
      });
    } else {
      parts.push({
        text: `Here is a document (${input.document.name}):\n\n${input.document.text}`,
      });
    }
  } else {
    parts.push({
      text: `Here is the content to analyze:\n\n${input.text || ""}`,
    });
  }

  parts.push({
    text: `What the user needs right now: "${intent.label}". ${intent.focus}`,
  });

  return parts;
}

function sanitizeResult(parsed, intent) {
  if (!parsed || typeof parsed !== "object") {
    parsed = {};
  }

  if (intent.forceReply) {
    parsed.needsResponse = true;
  }

  if (!Array.isArray(parsed.actions)) {
    parsed.actions = [];
  }

  if (!Array.isArray(parsed.watchouts)) {
    parsed.watchouts = [];
  }

  parsed.actions = parsed.actions
    .slice(0, 3)
    .map((item) => String(item));

  parsed.watchouts = parsed.watchouts
    .slice(0, 2)
    .map((item) => String(item));

  if (!["high", "medium", "low"].includes(parsed.confidence)) {
    parsed.confidence = null;
  }

  if (
    parsed.chart &&
    typeof parsed.chart === "object" &&
    Array.isArray(parsed.chart.items)
  ) {
    parsed.chart.items = parsed.chart.items
      .slice(0, 6)
      .map((item) => ({
        label: String(item.label || ""),
        value: Number(item.value) || 0,
      }))
      .filter((item) => item.label);

    if (parsed.chart.items.length === 0) {
      parsed.chart = null;
    }
  } else {
    parsed.chart = null;
  }

  if (typeof parsed.whatHappened !== "string") {
    parsed.whatHappened = "";
  }

  if (typeof parsed.why !== "string") {
    parsed.why = "";
  }

  if (typeof parsed.followUpQuestion !== "string") {
    parsed.followUpQuestion = "";
  }

  if (typeof parsed.suggestedResponse !== "string") {
    parsed.suggestedResponse = "";
  }

  parsed.needsFollowUp =
    !!parsed.needsFollowUp &&
    parsed.followUpQuestion.trim().length > 0;

  parsed.needsResponse = !!parsed.needsResponse;

  return parsed;
}

app.post("/api/analyze", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Server is missing GEMINI_API_KEY.",
      });
    }

    const {
      input,
      intentId,
      contents: existingContents,
      message,
    } = req.body || {};

    const intent = INTENTS[intentId];

    if (!intent) {
      return res.status(400).json({
        error: "Unknown intent.",
      });
    }

    let contents;

    // Continuing an existing conversation
    if (
      Array.isArray(existingContents) &&
      existingContents.length > 0 &&
      message
    ) {
      contents = [
        ...existingContents,
        {
          role: "user",
          parts: [{ text: String(message) }],
        },
      ];
    } else {
      if (!input) {
        return res.status(400).json({
          error: "Missing input.",
        });
      }

      contents = [
        {
          role: "user",
          parts: buildGeminiParts(input, intent),
        },
      ];
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: SYSTEM_PROMPT,
              },
            ],
          },

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
        error: `Gemini API error (${status}).`,
      });
    }

    const responseText = await geminiRes.text();

    console.log("Gemini response received.");

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("Gemini returned invalid JSON.");

      return res.status(502).json({
        error: "Invalid response from Gemini.",
      });
    }

    const raw = (
      data?.candidates?.[0]?.content?.parts || []
    )
      .map((part) => part.text || "")
      .join("\n")
      .trim();

    if (!raw) {
      return res.status(502).json({
        error: "Gemini returned an empty response.",
      });
    }

    const cleaned = raw
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      console.error("Could not parse Gemini JSON:", cleaned);

      return res.status(502).json({
        error: "Couldn't make sense of Gemini's response.",
      });
    }

    parsed = sanitizeResult(parsed, intent);

    const updatedContents = [
      ...contents,
      {
        role: "model",
        parts: [
          {
            text: raw,
          },
        ],
      },
    ];

    return res.json({
      result: parsed,
      contents: updatedContents,
    });
  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Something went wrong on the server.",
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "What Now?",
  });
});

// Helpful root route for testing Vercel
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "What Now? API is running.",
  });
});

// IMPORTANT:
// This is ESM, so DO NOT use:
// require.main
// module.exports
//
// Vercel can use the default export directly.

export default app;

// Local development only.
// When running `npm run dev`, start Express.
// Vercel will use the exported app.
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 8787;

  app.listen(PORT, () => {
    console.log(
      `What Now? server running on http://localhost:${PORT}`
    );
  });
}