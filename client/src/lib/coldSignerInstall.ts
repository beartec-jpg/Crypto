const COLD_SIGNER_INSTALL_REQUEST_KEY = 'cold-signer-install-request';

export const coldSignerInstallUrl = '/cold-signer/?install=1';

export function requestColdSignerInstall(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(COLD_SIGNER_INSTALL_REQUEST_KEY, String(Date.now()));
}