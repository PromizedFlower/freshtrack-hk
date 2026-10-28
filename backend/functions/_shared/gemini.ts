// Shared Gemini 2.5 Flash helper for FreshTrack HK edge functions.
// Enforces strict JSON output and adds resilience against malformed model responses.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export interface GeminiRequest {
  systemPrompt: string;
  promptText: string;
  imageBase64: string;
  mimeType?: string;
}

// Robust JSON extraction: strips ```json fences and recovers the first {...} or [...] block,
// with a trailing-comma fix-up pass. Prevents 500s from cosmetic model output errors.
export function safeParseJson(raw: string): any {
  let s = (raw || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const objMatch = s.match(/\{[\s\S]*\}/);
  const arrMatch = s.match(/\[[\s\S]*\]/);
  const candidate = objMatch ? objMatch[0] : arrMatch ? arrMatch[0] : s;

  try {
    return JSON.parse(candidate);
  } catch {
    const fixed = candidate.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(fixed);
  }
}

export async function callGemini(req: GeminiRequest): Promise<any> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const payload = {
    systemInstruction: { parts: [{ text: req.systemPrompt }] },
    contents: [
      {
        parts: [
          { text: req.promptText },
          { inlineData: { mimeType: req.mimeType || "image/jpeg", data: req.imageBase64 } },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json" },
  };

  const resp = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return safeParseJson(raw);
}

// Standard CORS preflight handler for all scan functions.
export function corsResponse(body: string | object, status = 200): Response {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}
