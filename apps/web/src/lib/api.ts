// Fetch wrapper. Access token lives in memory only; a 401 triggers one silent
// refresh (httpOnly cookie) and a retry before giving up.
let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

let refreshPromise: Promise<boolean> | null = null;

export async function tryRefresh(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fetch a binary resource with auth (+ one refresh retry) as a Blob. */
export async function apiBlob(path: string): Promise<Blob> {
  const doFetch = () =>
    fetch(`/api${path}`, {
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) res = await doFetch();
  if (!res.ok) throw new ApiError(res.status, 'Fetch failed');
  return res.blob();
}

/** Multipart upload with progress callback (fetch cannot report upload progress). */
export function apiUploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<T> {
  const attempt = () =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api${path}`);
      const token = getAccessToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(form);
    });

  return attempt().then(async (res) => {
    if (res.status === 401 && (await tryRefresh())) {
      const retry = await attempt();
      if (retry.status >= 400) throw new ApiError(retry.status, parseMessage(retry.body));
      return JSON.parse(retry.body) as T;
    }
    if (res.status >= 400) throw new ApiError(res.status, parseMessage(res.body));
    return JSON.parse(res.body) as T;
  });
}

const parseMessage = (body: string): string => {
  try {
    return (JSON.parse(body) as { message?: string }).message ?? 'Upload failed';
  } catch {
    return 'Upload failed';
  }
};

/** Multipart upload — same auth/refresh flow, but no JSON content-type. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const doFetch = () =>
    fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: form,
    });
  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) res = await doFetch();
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? 'Upload failed');
  }
  return (await res.json()) as T;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = () =>
    fetch(`/api${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });

  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) {
    res = await doFetch();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
