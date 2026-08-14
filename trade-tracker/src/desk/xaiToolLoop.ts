/**
 * Bounded xAI tool-calling loop for the standalone desk.
 */

import OpenAI from 'openai';

export interface ToolTraceEntry {
  name: string;
  args: Record<string, unknown>;
  ms: number;
  ok: boolean;
  /** Compact payload Grok received (for dashboard / chart replay). */
  result?: unknown;
}

export interface ToolLoopResult {
  message: any;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
  toolTrace: ToolTraceEntry[];
  iterations: number;
}

export async function runXaiToolLoop(opts: {
  apiKey: string;
  primaryModel?: string;
  fallbackModel?: string;
  messages: any[];
  tools: any[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown;
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
}): Promise<ToolLoopResult> {
  const primary = opts.primaryModel || process.env.XAI_PRIMARY_MODEL || 'grok-4.6';
  const fallback = opts.fallbackModel || process.env.XAI_FALLBACK_MODEL || 'grok-4-1-fast-reasoning';
  const maxIterations = opts.maxIterations ?? Number(process.env.DESK_MAX_TOOL_ITERS || 8);
  const temperature = opts.temperature ?? 0.35;
  const maxTokens = opts.maxTokens ?? 12_000;

  // Per-request HTTP timeout (not wall-clock for whole cycle).
  // grok-4.6 agentic rounds can exceed 3m; default 5m, override with DESK_XAI_TIMEOUT_MS.
  const httpTimeoutMs = Math.max(
    60_000,
    Number(process.env.DESK_XAI_TIMEOUT_MS || 300_000),
  );
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
    timeout: httpTimeoutMs,
  });

  const messages = [...opts.messages];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const toolTrace: ToolTraceEntry[] = [];
  let activeModel = primary;
  let lastMessage: any = null;
  let iterations = 0;

  const create = async (withTools: boolean) => {
    const params: any = {
      model: activeModel,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (withTools) {
      params.tools = opts.tools;
      params.tool_choice = 'auto';
    }
    try {
      return await (client.chat.completions.create as any)(params);
    } catch (err: any) {
      if (activeModel !== fallback) {
        console.warn(`[desk] model ${activeModel} failed (${err?.message}), falling back to ${fallback}`);
        activeModel = fallback;
        params.model = activeModel;
        return await (client.chat.completions.create as any)(params);
      }
      throw err;
    }
  };

  for (let i = 0; i < maxIterations; i++) {
    iterations = i + 1;
    const resp = await create(true);
    if (resp.usage) {
      usage.prompt_tokens += resp.usage.prompt_tokens || 0;
      usage.completion_tokens += resp.usage.completion_tokens || 0;
      usage.total_tokens += resp.usage.total_tokens || 0;
    }
    const message = resp.choices?.[0]?.message;
    lastMessage = message;
    const toolCalls = message?.tool_calls;
    if (!toolCalls?.length) {
      return { message, usage, model: activeModel, toolTrace, iterations };
    }
    messages.push(message);
    for (const call of toolCalls) {
      const name = call?.function?.name || 'unknown';
      let args: Record<string, unknown> = {};
      try {
        args = call?.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      const t0 = Date.now();
      let payload: unknown;
      let ok = true;
      try {
        payload = await opts.executeTool(name, args);
      } catch (e: any) {
        ok = false;
        payload = { error: e?.message || String(e) };
      }
      toolTrace.push({
        name,
        args,
        ms: Date.now() - t0,
        ok,
        // Keep full structured result so the desk UI can show what Grok saw
        // and plot chart-relevant levels (FVG/OB/VP/etc.).
        result: payload,
      });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: typeof payload === 'string' ? payload : JSON.stringify(payload),
      });
    }
  }

  // Cap: force final without tools
  const final = await create(false);
  if (final.usage) {
    usage.prompt_tokens += final.usage.prompt_tokens || 0;
    usage.completion_tokens += final.usage.completion_tokens || 0;
    usage.total_tokens += final.usage.total_tokens || 0;
  }
  lastMessage = final.choices?.[0]?.message || lastMessage;
  return { message: lastMessage, usage, model: activeModel, toolTrace, iterations };
}

export function extractTextContent(message: any): string {
  const c = message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((b: any) => (typeof b === 'string' ? b : b?.text || b?.content || ''))
      .join('');
  }
  if (message?.reasoning_content && typeof message.reasoning_content === 'string') {
    // some models put final JSON only in content; still try content first
  }
  return String(c || '');
}
