import { useEffect, useState } from 'react';
import type { FileUrlResponse, MessageAttachmentDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fileIcon = (mime: string) => {
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('zip') || mime.includes('compressed')) return '🗜️';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
  if (mime.includes('word') || mime.includes('document')) return '📄';
  return '📎';
};

function Lightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return (
    <div className="lightbox" onMouseDown={onClose}>
      <img src={url} alt={alt} onMouseDown={(e) => e.stopPropagation()} />
    </div>
  );
}

function ImageAttachment({ attachment }: { attachment: MessageAttachmentDto }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    // Presigned URLs expire — resolve per mount.
    api<FileUrlResponse>(`/files/${attachment.id}/url`)
      .then((res) => setUrl(res.url))
      .catch(() => setFailed(true));
  }, [attachment.id]);

  if (failed) return <div className="muted">🖼 {attachment.filename} unavailable</div>;
  if (!url) return <div className="image-attachment image-loading" />;
  return (
    <>
      <img
        className="image-attachment"
        src={url}
        alt={attachment.filename}
        title={attachment.filename}
        onClick={() => setZoomed(true)}
      />
      {zoomed && <Lightbox url={url} alt={attachment.filename} onClose={() => setZoomed(false)} />}
    </>
  );
}

function FileCard({ attachment }: { attachment: MessageAttachmentDto }) {
  const download = async () => {
    try {
      // Fresh presigned URL on every click — old messages never go stale.
      const res = await api<FileUrlResponse>(`/files/${attachment.id}/url`);
      const a = document.createElement('a');
      a.href = res.url;
      a.download = attachment.filename;
      a.click();
    } catch {
      /* gone */
    }
  };

  return (
    <button className="file-card" onClick={() => void download()} title="Download">
      <span className="file-card-icon">{fileIcon(attachment.mimeType)}</span>
      <span className="file-card-name">{attachment.filename}</span>
      <span className="muted file-card-size">{formatSize(attachment.sizeBytes)}</span>
      <span className="file-card-dl">⬇</span>
    </button>
  );
}

export default function AttachmentList({
  attachments,
}: {
  attachments: MessageAttachmentDto[];
}) {
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => a.isImage);
  const files = attachments.filter((a) => !a.isImage);
  return (
    <div className="attachment-list">
      {images.map((a) => (
        <ImageAttachment key={a.id} attachment={a} />
      ))}
      {files.map((a) => (
        <FileCard key={a.id} attachment={a} />
      ))}
    </div>
  );
}
