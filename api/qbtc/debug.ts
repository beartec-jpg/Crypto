import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const info: Record<string, any> = {
    step: 'init',
    env: {
      hasNodes: !!process.env.QBTC_RPC_NODES,
      nodesList: process.env.QBTC_RPC_NODES || '(not set)',
      hasAuth: !!process.env.QBTC_RPC_NODES_AUTH,
      hasUser: !!process.env.QBTC_RPC_USER,
      hasPass: !!process.env.QBTC_RPC_PASSWORD,
    },
  };

  // Self-contained RPC call — no imports from _lib
  try {
    const nodesEnv = process.env.QBTC_RPC_NODES || '';
    const authEnv = process.env.QBTC_RPC_NODES_AUTH || '';
    const urls = nodesEnv.split(',').map(u => u.trim()).filter(Boolean);
    const auths = authEnv.split(',').map(a => a.trim());
    
    if (!urls.length) {
      info.error = 'No QBTC_RPC_NODES configured';
      return res.status(200).json(info);
    }

    info.step = 'calling_rpc';
    const url = urls[0];
    const auth = auths[0] || '';
    const colonIdx = auth.indexOf(':');
    const user = colonIdx >= 0 ? auth.slice(0, colonIdx) : (process.env.QBTC_RPC_USER || '');
    const pass = colonIdx >= 0 ? auth.slice(colonIdx + 1) : (process.env.QBTC_RPC_PASSWORD || '');
    
    info.targetNode = url;
    info.authUser = user;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getblockcount', params: [] }),
    });

    const data = await resp.json();
    info.step = 'done';
    info.rpcResult = data;
  } catch (err: any) {
    info.error = err.message;
    info.stack = err.stack?.split('\n').slice(0, 5);
  }

  return res.status(200).json(info);
}
