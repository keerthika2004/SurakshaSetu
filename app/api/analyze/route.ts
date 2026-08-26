import { NextResponse } from "next/server";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.4-nano";

const SYSTEM_PROMPT = `You are a fraud-detection assistant for Indian citizens. Judge the scam risk of a message, call, or payment request the user received. Be decisive and clear, not alarmist.

CRITICAL: First, classify the user's situation into one of three states:
- "about-to-be": User received a suspicious link, message, or call but has NOT lost money and is not currently on the phone.
- "mid-attack": User is CURRENTLY on a call (e.g., fake CBI/police digital arrest) or is actively being pressured to transfer money RIGHT NOW.
- "already-scammed": User has already transferred money, paid a fee, or their account was debited.

Use these India-specific scam patterns:
- Digital arrest: caller claims to be a police/CBI/customs/TRAI/courier; says a parcel, SIM, or case is in the user's name; demands money or "verification," often over a video call; pushes serecy and urgency. Truth: no Indian agency arrests over a call or asks for money - always a scam.
- UPI collect-request fraud: a "collect/request money" prompt that DEBITS the user if approved, disguised as receiving a refund/prize/payment. TRUTH: You never approve a request to RECEIVE money.
- OTP / phishing: anyone asking for OTP, CVV, PIN, card number, or links to "verify KYC / bank/ electricity bill/ update details." TRUTH: banks never ask for OTP; such links steal your data.
- Investment/ task/ crypto-doubling groups on whatsapp/ telegram promising high or guaranteed returns.
- Fake job/ loan offers requiring an upfront "registration/security/processing fee"
- Lottery/ KBC/ prize: "You won, pay a fee to claim."

Rules:
- If there are genuinely no red flags, return verdict "green" and state "about-to-be".
- "what_to_do" for any scam MUST include: do not pay, do not click, block the sender, and report at cybercrime.gov.in or call 1930.
- For "mid-attack", emphasize: "Hang up the call immediately. Real police never arrest over video calls."
- "how_it_works" = one plain-language sentence explaining the trick so the user spots it next time.
- Reply in the SAME language as the user's input.
- NEVER ask the user for personal or financial details.
- Return ONLY the JSON object, no extra text.`;

type Analysis = {
  state: "about-to-be" | "mid-attack" | "already-scammed";
  verdict: "green" | "yellow" | "red";
  scam_type: string;
  red_flags: string[];
  what_to_do: string[];
  how_it_works: string;
};

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["state", "verdict", "scam_type", "red_flags", "what_to_do", "how_it_works"],
  properties: {
    state: { type: "string", enum: ["about-to-be", "mid-attack", "already-scammed"] },
    verdict: { type: "string", enum: ["green", "yellow", "red"] },
    scam_type: { type: "string" },
    red_flags: { type: "array", items: { type: "string" } },
    what_to_do: { type: "array", items: { type: "string" } },
    how_it_works: { type: "string" },
  },
};

const safeDefault: Analysis = {
  state: "about-to-be",
  verdict: "yellow",
  scam_type: "Treat this as suspicious",
  red_flags: ["We couldn't analyse that completely — treat it as suspicious and avoid sharing details."],
  what_to_do: [
    "Do not pay or share personal or financial details.",
    "Do not click links or approve payment requests.",
    "Block the sender if they pressure you.",
    "Report suspected fraud at cybercrime.gov.in or call 1930.",
  ],
  how_it_works: "When a message cannot be checked, pausing and verifying independently is the safest next step.",
};

function getDeterministicFallback(text: string): Analysis {
  const lower = text.toLowerCase();
  
  // Already scammed heuristic
  if (lower.includes("paid") || lower.includes("lost") || lower.includes("transferred") || lower.includes("deducted") || lower.includes("already sent")) {
    return {
      state: "already-scammed",
      verdict: "red",
      scam_type: "Possible Fraud Incident",
      red_flags: ["Money has already been transferred or deducted."],
      what_to_do: ["Call 1930 immediately.", "Contact your bank to freeze the transaction.", "Save all chats and transaction IDs."],
      how_it_works: "Scammers create false urgency or promises to trick victims into sending money.",
    };
  }

  // Mid-attack heuristic
  if (lower.includes("on call") || lower.includes("on the phone") || lower.includes("video call") || lower.includes("threatening") || lower.includes("arrest") || lower.includes("cbi") || lower.includes("police")) {
    return {
      state: "mid-attack",
      verdict: "red",
      scam_type: "Active Scam Attempt (e.g. Digital Arrest)",
      red_flags: ["Caller is threatening arrest or demanding immediate payment.", "Claiming to be law enforcement over a phone/video call."],
      what_to_do: ["Hang up the call immediately.", "Real police NEVER arrest over video calls or ask for money.", "Do not transfer any funds.", "Block the number."],
      how_it_works: "Scammers impersonate authorities to induce panic and force you to pay 'fines' or 'security deposits'.",
    };
  }

  // About to be scammed heuristic (Default)
  return {
    state: "about-to-be",
    verdict: "yellow",
    scam_type: "Suspicious Contact",
    red_flags: ["Unsolicited contact asking for information, clicks, or money."],
    what_to_do: ["Do not click any links.", "Do not share OTPs, PINs, or personal details.", "Block the sender."],
    how_it_works: "Scammers send mass messages with phishing links or fake offers to steal credentials.",
  };
}

function isAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const expectedKeys = ["state", "verdict", "scam_type", "red_flags", "what_to_do", "how_it_works"];

  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => keys.includes(key)) &&
    (candidate.state === "about-to-be" || candidate.state === "mid-attack" || candidate.state === "already-scammed") &&
    (candidate.verdict === "green" || candidate.verdict === "yellow" || candidate.verdict === "red") &&
    typeof candidate.scam_type === "string" &&
    Array.isArray(candidate.red_flags) &&
    candidate.red_flags.every((flag) => typeof flag === "string") &&
    Array.isArray(candidate.what_to_do) &&
    candidate.what_to_do.every((step) => typeof step === "string") &&
    typeof candidate.how_it_works === "string"
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
  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Expected a non-empty text string." }, { status: 400 });
  }

  if (text.length > 5_000) {
    return NextResponse.json({ error: "Text must be 5,000 characters or fewer." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json(getDeterministicFallback(text));

  try {
    // A strict JSON schema makes malformed output unlikely; retry once if it still occurs.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const modelOutput = await getModelOutput(text, apiKey);
      const analysis = modelOutput ? parseAnalysis(modelOutput) : null;
      if (analysis) return NextResponse.json(analysis);
    }

    return NextResponse.json(getDeterministicFallback(text));
  } catch { return NextResponse.json(getDeterministicFallback(text)); }
}
