import { NextResponse } from "next/server";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.4-nano";

const SYSTEM_PROMPT = `You are a fraud-detection assistant for Indian citizens. Judge the scam risk of a message, call, or payment request the user received. Be decisive and clear, not alarmist.

CRITICAL: First, classify the user's situation into one of six states:
1. "out-of-scope": The input is completely unrelated to messages, calls, payments, or fraud (e.g., weather, recipes, random chat).
2. "clarify": The input is gibberish, too vague, or you cannot confidently match a scam pattern. Also use this for PANIC where details are missing (e.g. "HELP ME PLZ").
3. "data-at-risk": User shared sensitive data (OTP, Aadhaar, PAN, passwords, card details) but NO money is confirmed lost.
4. "about-to-be": User received a suspicious link, message, or call but has NOT lost money, NOT shared sensitive data, and is not currently on the phone.
5. "mid-attack": User is CURRENTLY on a call (e.g., fake CBI/police) or is actively being pressured to transfer money RIGHT NOW.
6. "already-scammed": User has already transferred money, paid a fee, or their account was debited.

State Instructions:
- If "out-of-scope", set verdict to "green", scam_type to "Out of Scope".
- If "clarify", set verdict to "yellow", provide ONE calm clarifying question in the "clarifying_question" field. If the user seems panicked (all-caps or distressed), prepend the question with a calming statement (e.g., "Take a deep breath, you did the right thing by checking. Did you already send money or share an OTP?").
- If "data-at-risk", set verdict to "red". "what_to_do" MUST include: lock/monitor accounts, block the card, change passwords, and report. Do NOT tell them to call 1930 to freeze funds unless money was lost.
- If "about-to-be", set verdict to "yellow" or "red".
- If "mid-attack", set verdict to "red". Emphasize: "Hang up the call immediately. Real police never arrest over video calls."
- If "already-scammed", set verdict to "red". "what_to_do" MUST include: Call 1930 immediately, freeze bank account.

General Rules:
- "how_it_works" = one plain-language sentence explaining the trick so the user spots it next time (leave empty for out-of-scope/clarify).
- Reply in the SAME language as the user's input.
- NEVER ask the user for personal or financial details.
- Return ONLY the JSON object, no extra text.`;

type AnalysisState = "about-to-be" | "mid-attack" | "already-scammed" | "data-at-risk" | "clarify" | "out-of-scope";

type Analysis = {
  state: AnalysisState;
  verdict: "green" | "yellow" | "red";
  scam_type: string;
  red_flags: string[];
  what_to_do: string[];
  how_it_works: string;
  clarifying_question: string;
};

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["state", "verdict", "scam_type", "red_flags", "what_to_do", "how_it_works", "clarifying_question"],
  properties: {
    state: { type: "string", enum: ["about-to-be", "mid-attack", "already-scammed", "data-at-risk", "clarify", "out-of-scope"] },
    verdict: { type: "string", enum: ["green", "yellow", "red"] },
    scam_type: { type: "string" },
    red_flags: { type: "array", items: { type: "string" } },
    what_to_do: { type: "array", items: { type: "string" } },
    how_it_works: { type: "string" },
    clarifying_question: { type: "string" },
  },
};

const safeDefault: Analysis = {
  state: "clarify",
  verdict: "yellow",
  scam_type: "Need more information",
  red_flags: [],
  what_to_do: [],
  how_it_works: "",
  clarifying_question: "We couldn't completely analyze that. Could you describe exactly what happened or paste the message?",
};

function getDeterministicFallback(text: string): Analysis | null {
  const lower = text.toLowerCase();
  
  // Guard 2 & 6: Pre-Triage Rules Engine (Injection Proof)
  // If we detect strong money-loss signals, override any LLM instruction
  if (lower.includes("paid") || lower.includes("lost") || lower.includes("transferred") || lower.includes("deducted") || lower.includes("already sent")) {
    return {
      state: "already-scammed",
      verdict: "red",
      scam_type: "Possible Fraud Incident",
      red_flags: ["Money has already been transferred or deducted."],
      what_to_do: ["Call 1930 immediately.", "Contact your bank to freeze the transaction.", "Save all chats and transaction IDs."],
      how_it_works: "Scammers create false urgency or promises to trick victims into sending money.",
      clarifying_question: ""
    };
  }

  // If we detect active threat signals
  if ((lower.includes("on call") || lower.includes("on the phone") || lower.includes("video call")) && (lower.includes("threatening") || lower.includes("arrest") || lower.includes("cbi") || lower.includes("police") || lower.includes("customs"))) {
    return {
      state: "mid-attack",
      verdict: "red",
      scam_type: "Active Scam Attempt (e.g. Digital Arrest)",
      red_flags: ["Caller is threatening arrest or demanding immediate payment.", "Claiming to be law enforcement over a phone/video call."],
      what_to_do: ["Hang up the call immediately.", "Real police NEVER arrest over video calls or ask for money.", "Do not transfer any funds.", "Block the number."],
      how_it_works: "Scammers impersonate authorities to induce panic and force you to pay 'fines' or 'security deposits'.",
      clarifying_question: ""
    };
  }

  // Otherwise, let the LLM handle scope, data-at-risk, panic, etc.
  return null;
}

function isAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const expectedKeys = ["state", "verdict", "scam_type", "red_flags", "what_to_do", "how_it_works", "clarifying_question"];

  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => keys.includes(key)) &&
    ["about-to-be", "mid-attack", "already-scammed", "data-at-risk", "clarify", "out-of-scope"].includes(candidate.state as string) &&
    (candidate.verdict === "green" || candidate.verdict === "yellow" || candidate.verdict === "red") &&
    typeof candidate.scam_type === "string" &&
    Array.isArray(candidate.red_flags) &&
    candidate.red_flags.every((flag) => typeof flag === "string") &&
    Array.isArray(candidate.what_to_do) &&
    candidate.what_to_do.every((step) => typeof step === "string") &&
    typeof candidate.how_it_works === "string" &&
    typeof candidate.clarifying_question === "string"
  );
}

function parseAnalysis(modelOutput: string): Analysis | null {
  try {
    const parsed: unknown = JSON.parse(modelOutput);
    return isAnalysis(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function getModelOutput(text: string, apiKey: string): Promise<string | null> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: SYSTEM_PROMPT,
      input: text,
      text: {
        format: {
          type: "json_schema",
          name: "fraud_analysis",
          strict: true,
          schema: analysisSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") return null;

  const responseBody = payload as { output_text?: unknown; output?: unknown };
  if (typeof responseBody.output_text === "string") return responseBody.output_text;

  // The REST response places generated text inside output[].content[].
  if (!Array.isArray(responseBody.output)) return null;
  for (const outputItem of responseBody.output) {
    if (!outputItem || typeof outputItem !== "object") continue;
    const content = (outputItem as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") continue;
      const item = contentItem as { type?: unknown; text?: unknown };
      if (item.type === "output_text" && typeof item.text === "string") return item.text;
    }
  }

  return null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const text = body && typeof body === "object" ? (body as { text?: unknown }).text : undefined;
  if (typeof text !== "string") {
    return NextResponse.json({ error: "Expected a non-empty text string." }, { status: 400 });
  }
  
  const trimmedText = text.trim();
  
  // Guard 1: Length / Meaningful words check
  // If blank or under 3 meaningful words, do NOT classify.
  const words = trimmedText.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 3) {
    return NextResponse.json({
      state: "clarify",
      verdict: "yellow",
      scam_type: "Need more information",
      red_flags: [],
      what_to_do: [],
      how_it_works: "",
      clarifying_question: "Tell me what happened — paste the complete message, or describe the call in a bit more detail.",
    });
  }

  if (trimmedText.length > 5_000) {
    return NextResponse.json({ error: "Text must be 5,000 characters or fewer." }, { status: 400 });
  }

  // Guard 2 & 6: Pre-triage rules engine takes precedence if confident
  const deterministicResult = getDeterministicFallback(trimmedText);
  if (deterministicResult) {
    return NextResponse.json(deterministicResult);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json(safeDefault);

  try {
    // LLM handles scope, data-at-risk, panic, and normal triage
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const modelOutput = await getModelOutput(trimmedText, apiKey);
      const analysis = modelOutput ? parseAnalysis(modelOutput) : null;
      if (analysis) return NextResponse.json(analysis);
    }

    return NextResponse.json(safeDefault);
  } catch { return NextResponse.json(safeDefault); }
}
