const COLD_SIGNER_INSTALL_REQUEST_KEY = 'cold-signer-install-request';

export const coldSignerInstallUrl = '/cold-signer/?install=1';
export const coldSignerInstallPopupUrl = '/cold-signer/?install=1&popup=1';

export function requestColdSignerInstall(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(COLD_SIGNER_INSTALL_REQUEST_KEY, String(Date.now()));
}

export function openColdSignerInstallPopup(): Window | null {
  if (typeof window === 'undefined') {
    return null;
  }

  requestColdSignerInstall();

  return window.open(
    coldSignerInstallPopupUrl,
    'cold-signer-install',
    'popup=yes,width=520,height=760,resizable=yes,scrollbars=yes'
  );
}