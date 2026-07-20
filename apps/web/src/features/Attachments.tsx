import { useEffect, useState } from 'react';
import type { MessageAttachmentDto } from '@inmobiles/shared-types';
import { useAuthedObjectUrl, downloadAuthedFile } from '../lib/media';
import { IconDownload, IconFile } from '../components/icons';

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const { url, failed } = useAuthedObjectUrl(`/files/${attachment.id}/raw`);
  const [zoomed, setZoomed] = useState(false);

  if (failed) return <div className="muted">{attachment.filename} unavailable</div>;
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
      await downloadAuthedFile(`/files/${attachment.id}/raw`, attachment.filename);
    } catch {
      /* gone */
    }
  };

  return (
    <button className="file-card" onClick={() => void download()} title="Download">
      <span className="file-card-icon">
        <IconFile size={19} />
      </span>
      <span className="file-card-name">{attachment.filename}</span>
      <span className="muted file-card-size">{formatSize(attachment.sizeBytes)}</span>
      <span className="file-card-dl">
        <IconDownload size={15} />
      </span>
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
