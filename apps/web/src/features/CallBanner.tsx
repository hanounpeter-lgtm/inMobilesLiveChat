import { useQuery } from '@tanstack/react-query';
import type { CallDto, ChannelSummary, JoinCallResponse } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useChatStore } from '../lib/chat-store';
import { IconPhone, IconVideo } from '../components/icons';

export const activeCallKey = (channelId: string) => ['call', channelId] as const;

export default function CallBanner({ channel }: { channel: ChannelSummary }) {
  const setCurrentCall = useChatStore((s) => s.setCurrentCall);
  const currentCall = useChatStore((s) => s.currentCall);

  const { data } = useQuery({
    queryKey: activeCallKey(channel.id),
    queryFn: () => api<{ call: CallDto | null }>(`/channels/${channel.id}/call`),
  });
  const call = data?.call;

  // Hide the banner while you're already in this call.
  if (!call || currentCall?.call.id === call.id) return null;

  const joinCall = async () => {
    const join = await api<JoinCallResponse>(`/channels/${channel.id}/call`, {
      method: 'POST',
      body: JSON.stringify({ type: call.type }),
    });
    setCurrentCall(join);
  };

  return (
    <div className="call-banner">
      <span className="call-banner-text">
        {call.type === 'video' ? <IconVideo size={16} /> : <IconPhone size={16} />} Call in
        progress — started by <strong>{call.startedBy.displayName}</strong>
        {call.isRecording && (
          <span className="rec-badge banner-rec">
            <span className="rec-dot" /> REC
          </span>
        )}
      </span>
      <button className="join-call-btn" onClick={() => void joinCall()}>
        Join call
      </button>
    </div>
  );
}
