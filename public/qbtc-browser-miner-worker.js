let running = false;
let currentConfig = null;
let throttleMs = 25;
let attemptsSinceReport = 0;
let lastReportAt = Date.now();

const DIFF1_TARGET = BigInt('0x00000000FFFF0000000000000000000000000000000000000000000000000000');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hexToBytes(hex) {
  const clean = String(hex || '').trim();
  if (!clean || clean.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function randomHex(byteCount) {
  const bytes = new Uint8Array(byteCount);
  self.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256d(bytes) {
  const first = await self.crypto.subtle.digest('SHA-256', bytes);
  const second = await self.crypto.subtle.digest('SHA-256', first);
  return new Uint8Array(second);
}

function difficultyToTarget(difficulty) {
  const safeDifficulty = Math.max(Number(difficulty || 0.000001), 0.000001);
  return DIFF1_TARGET / BigInt(Math.max(1, Math.round(safeDifficulty * 1_000_000_000))) * BigInt(1_000_000_000);
}

function hashBytesToBigIntLE(bytes) {
  return BigInt('0x' + bytesToHex(Uint8Array.from(bytes).reverse()));
}

async function buildMerkleRoot(job, extranonce1, extranonce2) {
  const coinbaseHex = `${job.coinb1 || ''}${extranonce1 || ''}${extranonce2 || ''}${job.coinb2 || ''}`;
  let merkle = await sha256d(hexToBytes(coinbaseHex));
  for (const branch of job.merkle_branches || []) {
    merkle = await sha256d(concatBytes(merkle, hexToBytes(branch)));
  }
  return merkle;
}

async function mineLoop() {
  while (running) {
    if (!currentConfig?.job) {
      await sleep(300);
      continue;
    }

    const { worker_name, job, extranonce1, extranonce2_size, share_difficulty } = currentConfig;
    const extranonce2 = randomHex(Number(extranonce2_size || 4));
    const merkleRoot = await buildMerkleRoot(job, extranonce1, extranonce2);
    const headerPrefix = hexToBytes(
      `${job.version || ''}${job.prevhash || ''}${bytesToHex(Uint8Array.from(merkleRoot).reverse())}${job.ntime || ''}${job.nbits || ''}`
    );
    const target = difficultyToTarget(share_difficulty);

    for (let i = 0; i < 256 && running; i += 1) {
      const nonce = randomHex(4);
      const digest = await sha256d(concatBytes(headerPrefix, hexToBytes(nonce)));
      const shareHash = hashBytesToBigIntLE(digest);
      attemptsSinceReport += 1;

      if (shareHash <= target) {
        self.postMessage({
          type: 'share',
          payload: {
            worker_name,
            job_id: job.job_id,
            extranonce2,
            ntime: job.ntime,
            nonce,
          },
        });
      }
    }

    const now = Date.now();
    if (now - lastReportAt >= 1000) {
      const hashrate = (attemptsSinceReport * 1000) / Math.max(now - lastReportAt, 1);
      self.postMessage({ type: 'stats', payload: { hashrate } });
      attemptsSinceReport = 0;
      lastReportAt = now;
    }

    if (throttleMs > 0) {
      await sleep(throttleMs);
    }
  }
}

self.onmessage = (event) => {
  const { type, payload } = event.data || {};

  if (type === 'start') {
    currentConfig = payload || currentConfig;
    throttleMs = Number(payload?.throttleMs ?? throttleMs);
    if (!running) {
      running = true;
      mineLoop();
    }
  }

  if (type === 'job') {
    currentConfig = { ...(currentConfig || {}), ...(payload || {}) };
    throttleMs = Number(payload?.throttleMs ?? throttleMs);
  }

  if (type === 'stop') {
    running = false;
  }
};
