type GetTokenFn = () => Promise<string | null>;

let getTokenFn: GetTokenFn | null = null;

const isDevelopmentMode = typeof window !== 'undefined' && 
  (window.location.hostname.includes('replit') || 
   window.location.hostname.includes('localhost') ||
   window.location.hostname.includes('127.0.0.1'));

// Custom error class that preserves HTTP status code
export class ApiError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export function configureApiAuth(tokenFn: GetTokenFn) {
  getTokenFn = tokenFn;
}

async function getAuthToken(): Promise<string | null> {
  if (isDevelopmentMode) {
    return null;
  }
  
  if (!getTokenFn) {
    return null;
  }
  
  return await getTokenFn();
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new ApiError(`${res.status}: ${text}`, res.status);
  }
}

export async function authenticatedApiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (!isDevelopmentMode) {
    const token = await getAuthToken();
    if (token && token.length > 0) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  await throwIfResNotOk(res);
  return res;
}

export function isApiAuthConfigured(): boolean {
  return getTokenFn !== null || isDevelopmentMode;
}
