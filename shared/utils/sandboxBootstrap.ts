// shared/utils/sandboxBootstrap.ts
export type SandboxOptions = {
  autoInit?: boolean; // default false: do not auto-init on import
  skipLabels?: boolean;
  rootSelector?: string;
};

export type SandboxHandle = { disconnect: () => void };

function hideLabels(root: ParentNode) {
  try {
    const selector = '[data-sandbox-label], .sandbox-label';
    if (!(root instanceof Element)) return;
    const nodes = root.querySelectorAll(selector);
    nodes.forEach((n) => {
      const el = n as HTMLElement;
      if (el && el.style) el.style.display = 'none';
      el && el.setAttribute('data-sandbox-label-hidden', 'true');
    });
  } catch (e) {
    console.warn('sandboxBootstrap.hideLabels error', e);
  }
}

export function initSandboxBootstrap(options: SandboxOptions = {}): SandboxHandle {
  const { autoInit = false, skipLabels = true, rootSelector = '#root' } = options;
  if (!autoInit) return { disconnect: () => {} };

  const win = typeof window !== 'undefined' ? (window as any) : null;
  if (!win) return { disconnect: () => {} };

  if (win.__SANDBOX_BOOTSTRAPPED__) return { disconnect: () => {} };

  const root = document.querySelector(rootSelector) || document.body;
  if (skipLabels) hideLabels(root);

  try { document.documentElement.classList.add('sandbox-auto-init'); } catch (e) {}

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (skipLabels) hideLabels(node);
      });
    }
  });

  try { observer.observe(root, { childList: true, subtree: true }); } catch (e) {}

  win.__SANDBOX_BOOTSTRAPPED__ = true;

  return { disconnect: () => observer.disconnect() };
}

export default initSandboxBootstrap;
