export type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
};

export async function postDiscordWebhook(options: {
  webhookUrl: string;
  content?: string;
  embeds?: DiscordEmbed[];
}): Promise<{ ok: boolean; status: number; body: string }> {
  const { webhookUrl, content, embeds } = options;
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: content || undefined,
      embeds: embeds || undefined,
      allowed_mentions: { parse: [] as string[] },
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

export function colorForEvent(type: string): number {
  switch (type) {
    case 'entry_armed':
      return 0x94a3b8; // waiting confirm
    case 'entry_hit':
      return 0x38bdf8;
    case 'entry_invalid':
      return 0x64748b;
    case 'stop_lift':
      return 0xf59e0b; // amber — action required
    case 'tp1_hit':
    case 'tp2_hit':
      return 0x22c55e;
    case 'stop_to_be':
      return 0xa78bfa;
    case 'sl_hit':
      return 0xef4444;
    case 'be_hit':
      return 0xfbbf24;
    case 'closed':
      return 0x94a3b8;
    default:
      return 0x64748b;
  }
}
