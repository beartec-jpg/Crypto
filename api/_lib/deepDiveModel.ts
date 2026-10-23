/**
 * Deep-dive model selection. Primary runs on the xAI Responses API with an
 * explicit reasoning effort (grok-4.7 is Responses-only and defaults to
 * "high" effort, which is what made grok-4.6 blow the 150s cap).
 */
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
const EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];

export const DEFAULT_DEEP_DIVE_MODEL = 'grok-4.7';
export const DEFAULT_DEEP_DIVE_REASONING_EFFORT: ReasoningEffort = 'low';
export const DEFAULT_DEEP_DIVE_FALLBACK_MODEL = 'grok-4-1-fast-reasoning';

export interface DeepDiveModelConfig {
  primaryModel: string;
  reasoningEffort: ReasoningEffort;
  fallbackModel: string;
}

export function resolveDeepDiveModelConfig(
  env: Record<string, string | undefined> = process.env,
): DeepDiveModelConfig {
  const effort = String(env.XAI_DEEP_DIVE_REASONING_EFFORT || '').trim().toLowerCase() as ReasoningEffort;
  return {
    primaryModel: (env.XAI_DEEP_DIVE_MODEL || '').trim() || DEFAULT_DEEP_DIVE_MODEL,
    reasoningEffort: EFFORTS.includes(effort) ? effort : DEFAULT_DEEP_DIVE_REASONING_EFFORT,
    fallbackModel:
      (env.XAI_DEEP_DIVE_FALLBACK_MODEL || '').trim() ||
      (env.XAI_FALLBACK_MODEL || '').trim() ||
      DEFAULT_DEEP_DIVE_FALLBACK_MODEL,
  };
}

export function buildPrimaryResponsesRequest(
  cfg: DeepDiveModelConfig,
  systemContent: string,
  userContent: string,
  maxOutputTokens: number,
) {
  return {
    model: cfg.primaryModel,
    reasoning: { effort: cfg.reasoningEffort },
    input: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
    max_output_tokens: maxOutputTokens,
    store: false,
  };
}

/** Text of a Responses API result (output_text, else message output_text parts). */
export function responsesOutputText(resp: any): string {
  if (typeof resp?.output_text === 'string' && resp.output_text) return resp.output_text;
  const parts: string[] = [];
  for (const item of Array.isArray(resp?.output) ? resp.output : []) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if (c?.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
    }
  }
  return parts.join('');
}

/** Map a Responses result onto the chat-completion shape the parser already uses. */
export function responsesToCompletion(resp: any) {
  const text = responsesOutputText(resp);
  if (!text.trim()) {
    throw new Error(`empty response from ${resp?.model || 'primary model'} (status ${resp?.status || 'unknown'})`);
  }
  return {
    choices: [{ message: { content: text } }],
    usage: {
      prompt_tokens: resp?.usage?.input_tokens || 0,
      completion_tokens: resp?.usage?.output_tokens || 0,
      reasoning_tokens: resp?.usage?.output_tokens_details?.reasoning_tokens || 0,
    },
  };
}
