import { createContext, useCallback, useContext, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';
import { useSocketEvent } from './SocketContext.jsx';

const ChatCtx = createContext(null);
const MAX_OPEN = 3;

export function ChatProvider({ children }) {
  const { user, refresh } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState([]); // [{ id, minimized }]

  const openChat = useCallback((id) => {
    setOpen((list) => {
      const rest = list.filter((c) => c.id !== id);
      return [{ id, minimized: false }, ...rest].slice(0, MAX_OPEN + 4);
    });
  }, []);

  const openChatWithUser = useCallback(async (userId) => {
    const conv = await api('/conversations', { method: 'POST', body: { user_ids: [userId] } });
    openChat(conv.id);
    return conv;
  }, [openChat]);

  const closeChat = useCallback((id) => setOpen((l) => l.filter((c) => c.id !== id)), []);
  const toggleMin = useCallback((id) => setOpen((l) => l.map((c) => (c.id === id ? { ...c, minimized: !c.minimized } : c))), []);

  // Incoming messages pop open a chat head, unless you're already on the Messenger page.
  useSocketEvent('message', (m) => {
    refresh();
    if (m.sender_id === user?.id || m.kind === 'system') return;
    if (location.pathname.startsWith('/messages')) return;
    api(`/conversations/${m.conversation_id}`).then((c) => {
      if (c.muted) return;
      if (user?.settings?.notify?.messages_sound !== false) ping();
      setOpen((l) => (l.some((x) => x.id === c.id) ? l : [{ id: c.id, minimized: false }, ...l]));
    }).catch(() => {});
  });
  useSocketEvent('read_self', refresh);

  return (
    <ChatCtx.Provider value={{ open, openChat, openChatWithUser, closeChat, toggleMin, MAX_OPEN }}>
      {children}
    </ChatCtx.Provider>
  );
}

export const useChat = () => useContext(ChatCtx);

let audioCtx;
function ping() {
  try {
    audioCtx ||= new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.25);
  } catch { /* audio not allowed yet */ }
}
