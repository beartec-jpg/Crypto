// src/utils/sandboxBootstrap.ts
// Helper to auto-initialize a lightweight "sandbox" environment and aggressively hide sandbox-specific labels.

export type SandboxOptions = {
  autoInit?: boolean;
  skipLabels?: boolean;
  rootSelector?: string;
};

function injectHideStyles() {
  try {
    const id = 'sandbox-hide-labels-style';
    if (document.getElementById(id)) return;
    const selectors = [
      '[data-sandbox-label]',
      '.sandbox-label',
      '.sandboxLabel',
      '[data-label]',
      '.label',
      '.annotation',
      '.tv-label',
      'svg text[data-sandbox-label]',
      'svg text.sandbox-label',
      'svg .sandbox-label',
    ];
    const css = `${selectors.join(', ')} { display: none !important; visibility: hidden !important; pointer-events: none !important; }`;
    const style = document.createElement('style');
    style.id = id;
    style.appendChild(document.createTextNode(css));
    document.head && document.head.appendChild(style);
  } catch (e) {
    // ignore
  }
}

function hideLabels(root: ParentNode) {
  try {
    const selector = '[data-sandbox-label], .sandbox-label, .sandboxLabel, [data-label], .label, .annotation, .tv-label, svg text[data-sandbox-label], svg text.sandbox-label';
    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) return;
    const nodes = (root as Element | Document | DocumentFragment).querySelectorAll(selector);
    nodes.forEach((n) => {
      const el = n as HTMLElement | SVGElement;
      try {
        if (el && (el as HTMLElement).style) (el as HTMLElement).style.display = 'none';
      } catch (err) {
        // fall back to attribute marker
      }
      try { el && el.setAttribute && el.setAttribute('data-sandbox-label-hidden', 'true'); } catch (e) {}
    });
  } catch (e) {
    // swallow any errors to avoid breaking the host app
    // eslint-disable-next-line no-console
    console.warn('sandboxBootstrap.hideLabels error', e);
  }
}

export default function sandboxBootstrap(options: SandboxOptions = {}) {
  const { autoInit = true, skipLabels = true, rootSelector = 'body' } = options;

  // Guard to ensure we only bootstrap once per page load
  const win = typeof window !== 'undefined' ? (window as any) : null;
  if (!win) return { disconnect: () => {} };
  if (win.__SANDBOX_BOOTSTRAPPED__) return { disconnect: () => {} };
  if (!autoInit) return { disconnect: () => {} };

  // Inject aggressive hide CSS so labels are hidden even before JS can toggle inline styles
  if (skipLabels) injectHideStyles();

  const root = document.querySelector(rootSelector) || document.body;

  // hide labels immediately if requested (run on document too)
  if (skipLabels) {
    try { hideLabels(document); } catch (e) {}
    try { hideLabels(root); } catch (e) {}
  }

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
        if (skipLabels) {
          try { hideLabels(node); } catch (e) {}
          // attempt to also re-apply global style if needed
          try { injectHideStyles(); } catch (e) {}
        }
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
