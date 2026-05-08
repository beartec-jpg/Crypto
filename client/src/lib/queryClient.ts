import { QueryClient, QueryFunction } from "@tanstack/react-query";

let getAuthTokenFn: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(fn: () => Promise<string | null>) {
  getAuthTokenFn = fn;
}

const isDevelopmentMode = typeof window !== 'undefined' && 
  (window.location.hostname.includes('replit') || 
   window.location.hostname.includes('localhost') ||
   window. location.hostname.includes('127.0.0.1') ||
   window.location.pathname.includes('/dev'));

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  authToken?: string,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  
  const fullUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url;
  
  const res = await fetch(fullUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
  url?: string;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior, url: overrideUrl }) =>
  async ({ queryKey }) => {
    const headers: Record<string, string> = {};
    
    if (!isDevelopmentMode && getAuthTokenFn) {
      const token = await getAuthTokenFn();
      if (token && token.length > 0) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    
    const fetchUrl = overrideUrl ?? (queryKey.join("/") as string);
    const res = await fetch(fetchUrl, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
