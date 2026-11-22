import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import MessageThread, { ConvAvatar, convName } from './MessageThread.jsx';
import Icon from './Icon.jsx';
import NewMessage from './NewMessage.jsx';

/** Bottom-right chat heads and popup windows. */
export default function ChatDock() {
  const { user } = useAuth();
  const { open, closeChat, toggleMin, MAX_OPEN, openChat } = useChat();
  const loc = useLocation();
  const [convs, setConvs] = useState({});
  const [composing, setComposing] = useState(false);

  const load = (id) => api(`/conversations/${id}`).then((c) => setConvs((m) => ({ ...m, [id]: c }))).catch(() => closeChat(id));
  useEffect(() => { open.forEach((o) => !convs[o.id] && load(o.id)); }, [open]);
  useSocketEvent('message', (m) => { if (convs[m.conversation_id]) load(m.conversation_id); });

  if (loc.pathname.startsWith('/messages')) return null;
  const windows = open.slice(0, MAX_OPEN);
  const heads = open.slice(MAX_OPEN);

  return (
    <div className="chat-dock">
      <div className="chat-heads">
        {heads.map((o) => convs[o.id] && (
          <button key={o.id} className="chat-head" title={convName(convs[o.id], user.id)} onClick={() => openChat(o.id)}>
            <ConvAvatar c={convs[o.id]} me={user.id} size={48} />
            {convs[o.id].unread > 0 && <span className="badge-count">{convs[o.id].unread}</span>}
          </button>
        ))}
        <button className="chat-head new" title="New message" onClick={() => setComposing(true)}><Icon name="edit" /></button>
      </div>
      {windows.map((o) => {
        const c = convs[o.id];
        if (o.minimized) {
          return c ? (
            <button key={o.id} className="chat-head" title={convName(c, user.id)} onClick={() => toggleMin(o.id)}>
              <ConvAvatar c={c} me={user.id} size={48} />
              {c.unread > 0 && <span className="badge-count">{c.unread}</span>}
            </button>
          ) : null;
        }
        return (
          <div key={o.id} className="chat-window card">
            <MessageThread compact conversationId={o.id} onHeaderClick={() => toggleMin(o.id)}
              headerExtra={
                <div className="thread-head-actions">
                  <Link to={`/messages/${o.id}`} className="icon-btn sm chat-c" title="Open in Messenger"><Icon name="chat" size={16} /></Link>
                  <button className="icon-btn sm chat-c" title="Minimize" onClick={() => toggleMin(o.id)}><Icon name="chevronDown" size={16} /></button>
                  <button className="icon-btn sm chat-c" title="Close" onClick={() => closeChat(o.id)}><Icon name="x" size={16} /></button>
                </div>
              } />
          </div>
        );
      })}
      {composing && <NewMessage onClose={() => setComposing(false)} onOpen={(c) => { setComposing(false); openChat(c.id); }} />}
    </div>
  );
}
