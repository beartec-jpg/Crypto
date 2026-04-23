/**
 * Shared QBTC testnet RPC helper with multi-node failover.
 *
 * Environment variables:
 *   QBTC_RPC_NODES        Comma-separated node URLs (primary config)
 *   QBTC_RPC_NODES_AUTH   Comma-separated "user:pass" pairs aligned with QBTC_RPC_NODES
 *   QBTC_RPC_USER         Shared RPC username (fallback when QBTC_RPC_NODES_AUTH is absent)
 *   QBTC_RPC_PASSWORD     Shared RPC password
 *   QBTC_RPC_URL          Single-node fallback (backward-compatible)
 */

export interface RpcResult<T = any> {
  result: T;
  nodeUrl: string;
}

export interface NodeStatus {
  nodeUrl: string;
  ok: boolean;
  blocks: number | null;
  headers: number | null;
  latencyMs: number | null;
  chain: string | null;
  verificationProgress: number | null;
  dagmode: string | null;
  pqc: any;
  error?: string;
}

interface NodeConfig {
  url: string;
  user: string;
  pass: string;
}

// Module-level best-node cache — valid for 30 s within a warm serverless instance.
let cachedBestNode: { node: NodeConfig; expiresAt: number } | null = null;

function getNodeConfigs(): NodeConfig[] {
  const nodesEnv = process.env.QBTC_RPC_NODES;
  const authEnv = process.env.QBTC_RPC_NODES_AUTH;
  const sharedUser = process.env.QBTC_RPC_USER || '';
  const sharedPass = process.env.QBTC_RPC_PASSWORD || '';

  if (nodesEnv) {
    const urls = nodesEnv.split(',').map((u) => u.trim()).filter(Boolean);
    if (authEnv) {
      const auths = authEnv.split(',').map((a) => a.trim());
      return urls.map((url, i) => {
        const raw = auths[i] || '';
        const colonIdx = raw.indexOf(':');
        const user = colonIdx >= 0 ? raw.slice(0, colonIdx) : sharedUser;
        const pass = colonIdx >= 0 ? raw.slice(colonIdx + 1) : sharedPass;
        return { url, user, pass };
      });
    }
    return urls.map((url) => ({ url, user: sharedUser, pass: sharedPass }));
  }

  // Backward-compatible single-node fallback
  const fallbackUrl = process.env.QBTC_RPC_URL || '';
  if (!fallbackUrl) return [];
  return [{ url: fallbackUrl, user: sharedUser, pass: sharedPass }];
}

async function callSingleNode(
  node: NodeConfig,
  method: string,
  params: any[],
  wallet?: string,
): Promise<any> {
  const url = wallet
    ? `${node.url.replace(/\/$/, '')}/wallet/${wallet}`
    : node.url;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${node.user}:${node.pass}`).toString('base64')}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(8000),
  });

  const data = (await response.json()) as any;
  if (data?.error) {
    const err = new Error(data.error.message || 'QBTC RPC error');
    (err as any).code = data.error.code;
    throw err;
  }

  return data?.result;
}

async function probeAndPickBest(
  nodes: NodeConfig[],
  method: string,
  params: any[],
): Promise<{ result: any; node: NodeConfig }> {
  const overallTimeoutMs = 15_000;

  const probePromise = Promise.allSettled(
    nodes.map(async (node) => {
      const result = await callSingleNode(node, method, params);
      return { result, node };
    }),
  );

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Overall RPC timeout (15 s)')), overallTimeoutMs),
  );

  const results = await Promise.race([probePromise, timeoutPromise]);

  const fulfilled = results
    .filter(
      (r): r is PromiseFulfilledResult<{ result: any; node: NodeConfig }> =>
        r.status === 'fulfilled',
    )
    .map((r) => r.value);

  if (!fulfilled.length) {
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => (r.reason as Error)?.message || 'unknown error')
      .join('; ');
    throw new Error(`All QBTC RPC nodes failed: ${errors}`);
  }

  // For getblockchaininfo, pick the node that agrees with the majority on bestblockhash
  // at a common height, falling back to highest-block if no consensus can be found.
  // This prevents a forked/solo-mined node from being selected just because it has more blocks.
  if (method === 'getblockchaininfo') {
    if (fulfilled.length === 1) return fulfilled[0];

    // Find the minimum block height across all healthy nodes (safe common ground)
    const minBlocks = Math.min(...fulfilled.map((f) => f.result?.blocks ?? 0));

    // Group nodes by their bestblockhash at the common height.
    // We can't do a second RPC call here easily, so use bestblockhash directly
    // but only trust nodes whose block count is within 500 blocks of the minimum.
    // Nodes more than 500 blocks ahead of others are likely on a fork.
    const maxBlocks = Math.max(...fulfilled.map((f) => f.result?.blocks ?? 0));
    const maxAllowedDelta = 500;

    const sane = fulfilled.filter(
      (f) => (f.result?.blocks ?? 0) >= minBlocks && (maxBlocks - (f.result?.blocks ?? 0)) <= maxAllowedDelta,
    );

    // If all nodes diverge wildly (>500 block spread), use the majority by bestblockhash
    const hashGroups = new Map<string, typeof fulfilled>();
    for (const f of fulfilled) {
      const h = f.result?.bestblockhash ?? '';
      if (!hashGroups.has(h)) hashGroups.set(h, []);
      hashGroups.get(h)!.push(f);
    }

    // Find the largest group of agreeing nodes
    let bestGroup: typeof fulfilled = [];
    for (const group of hashGroups.values()) {
      if (group.length > bestGroup.length) bestGroup = group;
    }

    // From the majority group (or sane nodes), pick highest blocks
    const candidates = bestGroup.length > 1 ? bestGroup : (sane.length ? sane : fulfilled);
    return candidates.reduce((best, cur) =>
      (cur.result?.blocks ?? 0) > (best.result?.blocks ?? 0) ? cur : best,
    );
  }

  return fulfilled[0];
}

/**
 * Call any QBTC testnet RPC method with automatic multi-node failover.
 * The best node is cached for 30 s; the cache is bypassed if it fails.
 */
export async function rpcCall<T = any>(
  method: string,
  params: any[] = [],
): Promise<RpcResult<T>> {
  const nodes = getNodeConfigs();
  if (!nodes.length) throw new Error('No QBTC RPC nodes configured.');

  const now = Date.now();

  // Try the cached best node first to avoid probing all nodes on every request.
  if (cachedBestNode && cachedBestNode.expiresAt > now) {
    try {
      const result = await callSingleNode(cachedBestNode.node, method, params);
      return { result, nodeUrl: cachedBestNode.node.url };
    } catch {
      // Cached node failed — invalidate and fall through to re-probe all nodes.
      cachedBestNode = null;
    }
  }

  const { result, node } = await probeAndPickBest(nodes, method, params);
  cachedBestNode = { node, expiresAt: now + 30_000 };
  return { result, nodeUrl: node.url };
}

/**
 * Call an RPC method on a specific node (e.g. faucet write operations).
 * Falls back to the first configured node if pinnedUrl is absent or not found.
 */
export async function rpcCallPinned<T = any>(
  pinnedUrl: string | undefined | null,
  method: string,
  params: any[] = [],
  wallet?: string,
): Promise<RpcResult<T>> {
  const nodes = getNodeConfigs();
  if (!nodes.length) throw new Error('No QBTC RPC nodes configured.');

  let node: NodeConfig;
  if (pinnedUrl) {
    node = nodes.find((n) => n.url === pinnedUrl) ?? nodes[0];
  } else {
    node = nodes[0];
  }

  const result = await callSingleNode(node, method, params, wallet);
  return { result, nodeUrl: node.url };
}

/**
 * Probe every configured node and return per-node health information.
 * Intended for the /api/qbtc/health endpoint.
 */
export async function probeAllNodes(): Promise<NodeStatus[]> {
  const nodes = getNodeConfigs();

  const probes = await Promise.allSettled(
    nodes.map(async (node): Promise<NodeStatus> => {
      const start = Date.now();
      const info = await callSingleNode(node, 'getblockchaininfo', []);
      return {
        nodeUrl: node.url,
        ok: true,
        blocks: info?.blocks ?? null,
        headers: info?.headers ?? null,
        latencyMs: Date.now() - start,
        chain: info?.chain ?? null,
        verificationProgress: info?.verificationprogress ?? null,
        dagmode: info?.dagmode ?? null,
        pqc: info?.pqc ?? null,
      };
    }),
  );

  return probes.map((r, i): NodeStatus => {
    if (r.status === 'fulfilled') return r.value;
    return {
      nodeUrl: nodes[i].url,
      ok: false,
      blocks: null,
      headers: null,
      latencyMs: null,
      chain: null,
      verificationProgress: null,
      dagmode: null,
      pqc: null,
      error: (r.reason as Error)?.message || 'Failed',
    };
  });
}
