import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/** Compose a poll (question + 2–10 options) posted into the channel. */
export default function CreatePollModal({
  channelId,
  onClose,
}: {
  channelId: string;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const setOption = (i: number, v: string) =>
    setOptions((o) => o.map((x, idx) => (idx === i ? v : x)));

  const submit = async () => {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) {
      setError('Add a question and at least two options');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/channels/${channelId}/polls`, {
        method: 'POST',
        body: JSON.stringify({ question: question.trim(), options: opts, multiple }),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create poll');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3 className="modal-title">Create a poll</h3>
        <label className="field">
          Question
          <input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What should we decide?"
            maxLength={200}
          />
        </label>
        {options.map((o, i) => (
          <label className="field" key={i}>
            Option {i + 1}
            <input
              value={o}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              maxLength={100}
            />
          </label>
        ))}
        {options.length < 10 && (
          <button className="btn-secondary poll-add-option" onClick={() => setOptions((o) => [...o, ''])}>
            + Add option
          </button>
        )}
        <label className="poll-multiple">
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />
          Allow multiple choices
        </label>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Posting…' : 'Post poll'}
          </button>
        </div>
      </div>
    </div>
  );
}
