import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const info: Record<string, any> = {
    step: 'init',
    env: {
      hasNodes: !!process.env.QBTC_RPC_NODES,
      nodesCount: (process.env.QBTC_RPC_NODES || '').split(',').filter(Boolean).length,
      hasAuth: !!process.env.QBTC_RPC_NODES_AUTH,
      hasUser: !!process.env.QBTC_RPC_USER,
      hasPass: !!process.env.QBTC_RPC_PASSWORD,
      hasFaucetNode: !!process.env.QBTC_FAUCET_NODE,
    },
  };

  try {
    info.step = 'importing';
    const mod = await import('../_lib/rpcFailover.js');
    info.step = 'imported';
    info.exports = Object.keys(mod);
    
    info.step = 'calling rpcCall';
    const { result, nodeUrl } = await mod.rpcCall('getblockcount');
    info.step = 'done';
    info.blockCount = result;
    info.nodeUrl = nodeUrl;
  } catch (err: any) {
    info.error = err.message;
    info.stack = err.stack?.split('\n').slice(0, 5);
  }

  return res.status(200).json(info);
}
