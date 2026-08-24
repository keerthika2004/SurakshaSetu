import { NextResponse } from "next/server";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.4-nano";

const INSTRUCTIONS = `Draft a clear, factual cyber-fraud complaint for an Indian citizen to file at cybercrime.gov.in. Write in the same language as the supplied description, in first person and chronological order, using only the facts supplied. Include the approximate amount, payment method, and the description of what happened. Do not invent names, dates, transaction IDs, or other details. End with a clear request to freeze or recover the funds. Return only the complaint as plain text: no title, markdown, bullets, or commentary.`;

function getOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as { output_text?: unknown; output?: unknown };
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return null;

  for (const outputItem of response.output) {
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

function fallbackComplaint(description: string, amount: string, method: string) {
  return `I am reporting a suspected cyber fraud. I was contacted and the following happened: ${description.trim()}\n\nThe approximate amount involved is ${amount.trim()}, and the payment method was ${method.trim()}.\n\nI request that the relevant transaction and recipient account be checked immediately, and that action be taken to freeze or recover the funds if possible.`;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const values = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const description = values.description;
  const amount = values.amount;
  const method = values.method;

  if (typeof description !== "string" || typeof amount !== "string" || typeof method !== "string" || !description.trim() || !amount.trim() || !method.trim()) {
    return NextResponse.json({ error: "Description, amount, and payment method are required." }, { status: 400 });
  }

  if (description.length > 5_000 || amount.length > 100 || method.length > 100) {
    return NextResponse.json({ error: "One or more fields are too long." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response(fallbackComplaint(description, amount, method), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        instructions: INSTRUCTIONS,
        input: `Approximate amount lost: ${amount}\nPayment method: ${method}\nWhat happened: ${description}`,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);

    const complaint = getOutputText(await response.json());
    if (!complaint?.trim()) throw new Error("No complaint text returned");

    return new Response(complaint.trim(), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch { return new Response(fallbackComplaint(description, amount, method), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }); }
}
