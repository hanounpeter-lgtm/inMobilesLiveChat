import { useEffect, useState } from 'react';
import { apiBlob } from './api';

/**
 * Fetch an authed binary resource and expose it as an object URL for <img>/
 * <audio> (which can't send bearer tokens). Membership is enforced by the API;
 * the object URL is revoked on unmount / path change.
 */
export function useAuthedObjectUrl(path: string | null): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    setUrl(null);
    apiBlob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return { url, failed };
}

/** Download an authed file to disk via a temporary object URL. */
export async function downloadAuthedFile(path: string, filename: string) {
  const blob = await apiBlob(path);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
