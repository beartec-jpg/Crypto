// src/utils/sandboxBootstrap.ts
// Helper to auto-initialize a lightweight "sandbox" environment and optionally hide sandbox-specific labels.

export type SandboxOptions = {
  autoInit?: boolean;
  skipLabels?: boolean;
  rootSelector?: string;
};

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
    // swallow any errors to avoid breaking the host app
    // eslint-disable-next-line no-console
    console.warn('sandboxBootstrap.hideLabels error', e);
  }
}

export default function sandboxBootstrap(options: SandboxOptions = {}) {
  const { autoInit = true, skipLabels = true, rootSelector = '#root' } = options;

  // Guard to ensure we only bootstrap once per page load
  const win = window as any;
  if (win.__SANDBOX_BOOTSTRAPPED__) return { disconnect: () => {} };
  if (!autoInit) return { disconnect: () => {} };

  const root = document.querySelector(rootSelector) || document.body;

  // hide labels immediately if requested
  if (skipLabels) hideLabels(root);

  // Add a marker class to the documentElement so CSS in the host can target sandboxed state
  try {
    document.documentElement.classList.add('sandbox-auto-init');
  } catch (e) {
    // ignore
  }

  // Observe DOM changes and hide labels on newly added nodes
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (skipLabels) hideLabels(node);
      });
    }
  });

  try {
    observer.observe(root, { childList: true, subtree: true });
  } catch (e) {
    // in some embed contexts observe might throw; swallow errors
  }

  win.__SANDBOX_BOOTSTRAPPED__ = true;

  return {
    disconnect: () => observer.disconnect(),
  };
}
