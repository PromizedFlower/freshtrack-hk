// Shared open-source LLM client + lightweight web-search agent for FreshTrack HK edge functions.
//
// Any OpenAI-compatible endpoint works (DeepSeek, Qwen via SiliconFlow/DashScope, Together, Groq,
// or a self-hosted Ollama / vLLM server). Configure via secrets:
//   LLM_BASE_URL  e.g. https://api.deepseek.com/v1   (Ollama: http://host:11434/v1)
//   LLM_API_KEY   provider key (Ollama: anything, e.g. "ollama")
//   LLM_MODEL     e.g. deepseek-chat | qwen2.5:14b | llama-3.1-70b
//   TAVILY_API_KEY  (optional) enables the web_search tool
//
// The agent loop is intentionally framework-free (Deno edge friendly): model -> tool calls ->
// tool results -> model ... -> final strict JSON.

import { safeParseJson } from "./gemini.ts";

const LLM_BASE_URL = (Deno.env.get("LLM_BASE_URL") || "https://api.deepseek.com/v1").replace(/\/+$/, "");
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") || "";
const LLM_MODEL = Deno.env.get("LLM_MODEL") || "deepseek-chat";
const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") || "";
const MAX_ROUNDS = Number(Deno.env.get("LLM_MAX_SEARCH_ROUNDS") || 2);

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export function hasLlm(): boolean {
  return Boolean(LLM_API_KEY);
}
export function hasSearch(): boolean {
  return Boolean(TAVILY_API_KEY);
}

export async function chatCompletion(messages: ChatMessage[], tools?: any[]): Promise<any> {
  if (!LLM_API_KEY) throw new Error("LLM_API_KEY not configured");

  const payload: any = { model: LLM_MODEL, messages, temperature: 0.4 };
  if (tools?.length) {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    }
    const data = await resp.json();
    return data?.choices?.[0]?.message ?? { role: "assistant", content: "" };
  } finally {
    clearTimeout(timer);
  }
}

// Tavily search (agent-oriented, returns a clean answer + snippets). No key -> no-op string.
export async function webSearch(query: string): Promise<string> {
  if (!TAVILY_API_KEY) return "web_search unavailable (TAVILY_API_KEY not set)";
  if (!query.trim()) return "web_search skipped (empty query)";
  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TAVILY_API_KEY}` },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 4,
        include_answer: true,
      }),
    });
    if (!resp.ok) return `web_search error ${resp.status}`;
    const data = await resp.json();
    const summary = data?.answer ? `Summary: ${data.answer}\n` : "";
    const items = (data?.results || [])
      .map((r: any) => `- ${r.title}: ${String(r.content || "").slice(0, 300)} (${r.url})`)
      .join("\n");
    return (summary + items).slice(0, 3000) || "no results";
  } catch (e) {
    return `web_search failed: ${String(e)}`;
  }
}

const SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the public web for culinary facts (ingredient substitutions, technique, regional recipes). Use sparingly — only when you genuinely need external information.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "search query" } },
      required: ["query"],
    },
  },
};

/**
 * Runs a bounded tool-calling loop and returns the parsed JSON object produced by the model.
 * If the model requests web_search, we execute it and feed results back, up to `maxRounds` times.
 */
export async function agentJson(opts: {
  system: string;
  user: string;
  allowSearch?: boolean;
  maxRounds?: number;
}): Promise<any> {
  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  const tools = opts.allowSearch !== false && hasSearch() ? [SEARCH_TOOL] : undefined;
  const rounds = Math.min(opts.maxRounds ?? MAX_ROUNDS, 3);

  for (let i = 0; i <= rounds; i++) {
    const msg = await chatCompletion(messages, tools);
    const calls = msg?.tool_calls;

    if (tools && Array.isArray(calls) && calls.length) {
      messages.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
      for (const c of calls) {
        let args: any = {};
        try {
          args = JSON.parse(c?.function?.arguments || "{}");
        } catch {
          args = {};
        }
        const out = c?.function?.name === "web_search"
          ? await webSearch(String(args?.query || ""))
          : "unknown tool";
        messages.push({ role: "tool", tool_call_id: c.id, content: out });
      }
      continue;
    }

    return safeParseJson(msg?.content || "{}");
  }

  // Safety net: force a final JSON answer after the tool rounds are exhausted.
  messages.push({ role: "user", content: "Return ONLY the final JSON object now, no prose." });
  const last = await chatCompletion(messages);
  return safeParseJson(last?.content || "{}");
}
