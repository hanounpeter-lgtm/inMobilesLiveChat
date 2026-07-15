import { useEffect, useRef } from 'react';
import { STICKER_PACK, stickerUrl, type Sticker } from './stickers';

export default function StickerPicker({
  onPick,
  onClose,
}: {
  onPick: (sticker: Sticker) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  return (
    <div className="sticker-picker" ref={ref}>
      <div className="sticker-picker-title muted">Stickers</div>
      <div className="sticker-grid">
        {STICKER_PACK.map((s) => (
          <button
            key={s.code}
            className="sticker-cell"
            title={s.label}
            onClick={() => onPick(s)}
          >
            <img src={stickerUrl(s.code)} alt={s.label} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
