import { useAuthStore } from '../store/auth.js';

const isProduction = import.meta.env.PROD;
const apiBaseUrl = import.meta.env.VITE_API_URL || '';

const SERVICES: Record<string, string> = {
  user: 'http://localhost:3001',
  post: 'http://localhost:3002',
  interaction: 'http://localhost:3003',
  feed: 'http://localhost:3004',
  notification: 'http://localhost:3005',
  search: 'http://localhost:3006',
  media: 'http://localhost:3007',
};

function getServiceUrl(path: string, _method: string): string {
  if (isProduction && apiBaseUrl) {
    return apiBaseUrl;
  }
  
  if (path.startsWith('/register') || path.startsWith('/users')) {
    if (path.includes('/posts')) {
      return SERVICES.post;
    }
    return SERVICES.user;
  }
  
  if (path.startsWith('/posts')) {
    if (path.includes('/like') || path.includes('/comments') || path.includes('/bookmark') || path.includes('/repost')) {
      return SERVICES.interaction;
    }
    return SERVICES.post;
  }
  
  if (path.startsWith('/feed')) {
    return SERVICES.feed;
  }
  
  if (path.startsWith('/notifications')) {
    return SERVICES.notification;
  }
  
  if (path.startsWith('/search')) {
    return SERVICES.search;
  }
  
  if (path.startsWith('/media')) {
    return SERVICES.media;
  }

  return SERVICES.user;
}

export async function request(path: string, options: RequestInit = {}) {
  const method = options.method || 'GET';
  const baseUrl = getServiceUrl(path, method);
  const url = `${baseUrl}/api/v1${path}`;
  
  const headers = new Headers(options.headers || {});
  
  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const user = useAuthStore.getState().user;
  if (user) {
    headers.set('x-mock-user-id', user.id);
    headers.set('x-mock-username', user.username);
    headers.set('x-mock-email', user.email);
    headers.set('Authorization', `Bearer mock.jwt.token`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) return null;

  return response.json();
}

export const api = {
  get: (path: string, options?: Omit<RequestInit, 'method'>) => request(path, { ...options, method: 'GET' }),
  post: (path: string, body?: any, options?: Omit<RequestInit, 'method' | 'body'>) => 
    request(path, { 
      ...options, 
      method: 'POST', 
      body: body instanceof FormData ? body : JSON.stringify(body) 
    }),
  put: (path: string, body?: any, options?: Omit<RequestInit, 'method' | 'body'>) => 
    request(path, { 
      ...options, 
      method: 'PUT', 
      body: body instanceof FormData ? body : JSON.stringify(body) 
    }),
  delete: (path: string, options?: Omit<RequestInit, 'method'>) => request(path, { ...options, method: 'DELETE' }),
};

export const resolveMediaUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  if (url.includes('/social-media-attachments/uploads/')) {
    const isVideo = url.match(/\.(mp4|webm|ogg)$/i);
    const suffix = isVideo ? '/index.m3u8' : '/large.jpg';
    return url.replace('/social-media-attachments/uploads/', '/social-media-attachments/processed/') + suffix;
  }
  return url;
};
