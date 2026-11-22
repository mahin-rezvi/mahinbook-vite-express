import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket, useSocketEvent } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fullName, activeLabel, QUICK_EMOJIS, EMOJI_PICKER } from '../lib/util.js';
import { Avatar, Menu, FilePicker, useObjectUrls, Spinner } from './ui.jsx';
import Icon from './Icon.jsx';

export function convName(c, me) {
  if (!c) return '';
  if (c.title) return c.title;
  const others = c.members.filter((m) => m.id !== me);
  if (!c.is_group) return others[0] ? (others[0].nickname || fullName(others[0])) : 'MahinBook user';
  return others.map((m) => m.first_name).join(', ') || 'Group';
}

export function ConvAvatar({ c, me, size = 40 }) {
  const others = c.members.filter((m) => m.id !== me);
  if (c.is_group) {
    if (c.image_url) return <Avatar user={{ id: c.id, avatar_url: c.image_url, first_name: c.title || 'G', last_name: '' }} size={size} />;
    return (
      <span className="group-avatar" style={{ width: size, height: size }}>
        <Avatar user={others[0]} size={size * 0.68} />
        <Avatar user={others[1] || others[0]} size={size * 0.68} />
      </span>
    );
  }
  return <Avatar user={others[0]} size={size} online={others[0]?.online} />;
}

/** The conversation view, shared between chat popups and the Messenger page. */
export default function MessageThread({ conversationId, compact = false, onHeaderClick, headerExtra, onConversation }) {
  const { user } = useAuth();
  const socket = useSocket();
  const toast = useToast();
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [typing, setTyping] = useState({});
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const listRef = useRef();
  const stick = useRef(true);
  const typingSent = useRef(0);
  const [url] = useObjectUrls(file ? [file] : []);

  const markRead = useCallback(() => {
    if (document.visibilityState === 'visible') api(`/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    setConv(null); setMessages([]);
    api(`/conversations/${conversationId}`).then((c) => { setConv(c); onConversation?.(c); });
    api(`/conversations/${conversationId}/messages`).then((d) => { setMessages(d.messages); setHasMore(d.has_more); stick.current = true; });
    markRead();
  }, [conversationId]);

  useLayoutEffect(() => {
    if (stick.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, typing]);

  useSocketEvent('message', (m) => {
    if (m.conversation_id !== conversationId) return;
    setMessages((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
    setTyping((t) => ({ ...t, [m.sender_id]: false }));
    if (m.sender_id !== user.id) markRead();
  });
  useSocketEvent('message_update', (m) => {
    if (m.conversation_id === conversationId) setMessages((l) => l.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
  });
  useSocketEvent('typing', (t) => {
    if (t.conversation_id === conversationId) setTyping((s) => ({ ...s, [t.user_id]: t.typing }));
  });
  useSocketEvent('read', (r) => {
    if (r.conversation_id !== conversationId) return;
    setConv((c) => c && { ...c, members: c.members.map((m) => (m.id === r.user_id ? { ...m, last_read_id: r.last_read_id } : m)) });
  });
  useSocketEvent('conversation', (c) => { if (c.id === conversationId) { setConv(c); onConversation?.(c); } });
  useSocketEvent('presence', (p) => {
    setConv((c) => c && { ...c, members: c.members.map((m) => (m.id === p.user_id ? { ...m, online: p.online, last_active: p.last_active } : m)) });
  });

  async function loadOlder() {
    const el = listRef.current;
    const h = el.scrollHeight;
    const d = await api(`/conversations/${conversationId}/messages?before=${messages[0].id}`);
    stick.current = false;
    setMessages((l) => [...d.messages, ...l]);
    setHasMore(d.has_more);
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - h; });
  }

  function onType(v) {
    setText(v);
    const now = Date.now();
    if (now - typingSent.current > 2000) { socket.send({ type: 'typing', conversation_id: conversationId, typing: true }); typingSent.current = now; }
    clearTimeout(onType.t);
    onType.t = setTimeout(() => { socket.send({ type: 'typing', conversation_id: conversationId, typing: false }); typingSent.current = 0; }, 2500);
  }

  async function send(content = text) {
    if (editing) {
      try { await api(`/messages/${editing.id}`, { method: 'PATCH', body: { content } }); } catch (e) { toast(e.message, 'error'); }
      setEditing(null); setText('');
      return;
    }
    if (!content.trim() && !file) return;
    const f = file;
    setText(''); setFile(null); setReplyTo(null); stick.current = true;
    socket.send({ type: 'typing', conversation_id: conversationId, typing: false });
    try {
      const m = await api(`/conversations/${conversationId}/messages`, { method: 'POST', form: { content, file: f, reply_to_id: replyTo?.id } });
      setMessages((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
    } catch (e) { toast(e.message, 'error'); }
  }

  if (!conv) return <div className="thread center-pad"><Spinner /></div>;
  const others = conv.members.filter((m) => m.id !== user.id);
  const other = others[0];
  const byId = Object.fromEntries(conv.members.map((m) => [m.id, m]));
  const typers = Object.entries(typing).filter(([id, t]) => t && Number(id) !== user.id).map(([id]) => byId[id]).filter(Boolean);
  // Last message each other member has read (for "Seen" avatars)
  const seenAt = {};
  for (const m of others) {
    if (m.last_read_id == null) continue;
    const lastMine = [...messages].reverse().find((x) => x.id <= m.last_read_id);
    if (lastMine) (seenAt[lastMine.id] ||= []).push(m);
  }
  const lastOwnId = [...messages].reverse().find((m) => m.sender_id === user.id && m.kind !== 'system')?.id;

  return (
    <div className={`thread ${compact ? 'compact' : ''}`} style={{ '--chat': conv.color }}>
      <div className="thread-head">
        <button className="thread-who" onClick={onHeaderClick}>
          <ConvAvatar c={conv} me={user.id} size={compact ? 32 : 40} />
          <span>
            <b className="ellipsis">{convName(conv, user.id)}</b>
            <span className="muted small">{conv.is_group ? `${conv.members.length} members` : activeLabel(other)}</span>
          </span>
        </button>
        {headerExtra}
      </div>

      <div className="thread-body" ref={listRef} onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}>
        {hasMore && <button className="link-btn center-block" onClick={loadOlder}>Load older messages</button>}
        {!hasMore && !conv.is_group && other && (
          <div className="thread-intro">
            <Avatar user={other} size={compact ? 56 : 80} />
            <b>{fullName(other)}</b>
            <span className="muted small">You're friends on MahinBook</span>
            {!compact && <Link className="btn btn-ghost btn-sm" to={`/profile/${other.username}`}>View profile</Link>}
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const nextM = messages[i + 1];
          const showTime = !prev || new Date(m.created_at) - new Date(prev.created_at) > 15 * 60 * 1000;
          if (m.kind === 'system') {
            return (
              <Fragment key={m.id}>
                {showTime && <div className="msg-time">{fmtTime(m.created_at)}</div>}
                <div className="msg-system">{m.sender_id === user.id ? 'You' : byId[m.sender_id]?.first_name || 'Someone'} {m.content}</div>
              </Fragment>
            );
          }
          const mine = m.sender_id === user.id;
          const firstOfRun = !prev || prev.sender_id !== m.sender_id || prev.kind === 'system' || showTime;
          const lastOfRun = !nextM || nextM.sender_id !== m.sender_id || nextM.kind === 'system';
          const sender = byId[m.sender_id];
          const isEmojiOnly = m.content && /^\p{Extended_Pictographic}{1,3}$/u.test(m.content.trim()) && !m.image_url;
          return (
            <Fragment key={m.id}>
              {showTime && <div className="msg-time">{fmtTime(m.created_at)}</div>}
              <div className={`msg-row ${mine ? 'mine' : ''} ${lastOfRun ? 'last' : ''}`}>
                {!mine && <span className="msg-av">{lastOfRun && <Avatar user={sender} size={28} />}</span>}
                <div className="msg-col">
                  {!mine && conv.is_group && firstOfRun && <span className="msg-sender">{sender?.nickname || sender?.first_name}</span>}
                  {m.reply_to && (
                    <div className="msg-reply-ref">
                      <Icon name="reply" size={12} /> {m.reply_to.content || (m.reply_to.image_url ? 'Photo' : 'Message unsent')}
                    </div>
                  )}
                  <div className="msg-line">
                    {m.deleted ? (
                      <div className="bubble unsent">{mine ? 'You unsent a message' : `${sender?.first_name || 'Someone'} unsent a message`}</div>
                    ) : (
                      <div className={`bubble ${isEmojiOnly ? 'emoji-only' : ''} ${m.image_url && !m.content ? 'image-only' : ''}`} title={new Date(m.created_at).toLocaleString()}>
                        {m.image_url && <a href={m.image_url} target="_blank" rel="noreferrer"><img src={m.image_url} alt="" /></a>}
                        {m.content && <span className="bubble-text">{linkify(m.content)}</span>}
                        {m.edited && <span className="edited">Edited</span>}
                      </div>
                    )}
                    {!m.deleted && (
                      <div className="msg-tools">
                        <Menu align={mine ? 'right' : 'left'} trigger={<button className="icon-btn sm" aria-label="React"><Icon name="smile" size={16} /></button>}>
                          <div className="quick-react">
                            {QUICK_EMOJIS.slice(0, 6).map((e) => (
                              <button key={e} onClick={() => api(`/messages/${m.id}/react`, { method: 'POST', body: { emoji: e } })}>{e}</button>
                            ))}
                          </div>
                        </Menu>
                        <button className="icon-btn sm" aria-label="Reply" onClick={() => setReplyTo(m)}><Icon name="reply" size={16} /></button>
                        {mine && (
                          <Menu align="right" trigger={<button className="icon-btn sm" aria-label="More"><Icon name="dots" size={16} /></button>} items={[
                            m.content && Date.now() - new Date(m.created_at) < 15 * 60 * 1000 && { icon: 'edit', label: 'Edit', onClick: () => { setEditing(m); setText(m.content); } },
                            { icon: 'trash', label: 'Unsend', danger: true, onClick: () => api(`/messages/${m.id}`, { method: 'DELETE' }) },
                          ]} />
                        )}
                      </div>
                    )}
                  </div>
                  {!!m.reactions?.length && (
                    <button className="msg-reactions" onClick={() => api(`/messages/${m.id}/react`, { method: 'POST', body: { emoji: m.reactions.find((r) => r.user_id === user.id)?.emoji || m.reactions[0].emoji } })}>
                      {[...new Set(m.reactions.map((r) => r.emoji))].join('')}{m.reactions.length > 1 && <span>{m.reactions.length}</span>}
                    </button>
                  )}
                  {seenAt[m.id] && (
                    <div className="seen-row">
                      {conv.is_group || m.id !== lastOwnId
                        ? seenAt[m.id].map((u) => <Avatar key={u.id} user={u} size={14} />)
                        : mine && <span className="muted small">Seen</span>}
                    </div>
                  )}
                  {mine && m.id === lastOwnId && !seenAt[m.id] && !others.some((o) => o.last_read_id >= m.id) && (
                    <div className="seen-row"><span className="muted small">Sent</span></div>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
        {typers.length > 0 && (
          <div className="msg-row last">
            <span className="msg-av"><Avatar user={typers[0]} size={28} /></span>
            <div className="bubble typing"><i /><i /><i /></div>
          </div>
        )}
      </div>

      {(replyTo || editing) && (
        <div className="reply-bar">
          <div>
            <b>{editing ? 'Editing message' : `Replying to ${replyTo.sender_id === user.id ? 'yourself' : byId[replyTo.sender_id]?.first_name}`}</b>
            <div className="muted ellipsis small">{(editing || replyTo).content || 'Photo'}</div>
          </div>
          <button className="icon-btn sm" onClick={() => { setReplyTo(null); setEditing(null); if (editing) setText(''); }}><Icon name="x" size={16} /></button>
        </div>
      )}
      {url && (
        <div className="attach-preview"><img src={url} alt="" /><button className="remove" onClick={() => setFile(null)}><Icon name="x" size={14} /></button></div>
      )}
      <div className="thread-input">
        <FilePicker onFiles={(f) => setFile(f[0])} className="icon-btn chat-c" accept="image/*"><Icon name="photo" /></FilePicker>
        <div className="ti-box">
          <textarea rows={1} placeholder="Aa" value={text} onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === 'Escape') { setReplyTo(null); setEditing(null); } }} />
          <Menu align="right" trigger={<button className="icon-btn sm chat-c" aria-label="Emoji"><Icon name="smile" size={18} /></button>}>
            <div className="emoji-grid">{EMOJI_PICKER.map((e) => <button key={e} onClick={() => setText((t) => t + e)}>{e}</button>)}</div>
          </Menu>
        </div>
        {text.trim() || file || editing
          ? <button className="icon-btn chat-c" onClick={() => send()} aria-label="Send"><Icon name="send" /></button>
          : <button className="icon-btn quick-emoji" onClick={() => send(conv.emoji || '👍')} aria-label="Send quick reaction">{conv.emoji || '👍'}</button>}
      </div>
    </div>
  );
}

function fmtTime(d) {
  const date = new Date(d);
  const today = new Date().toDateString() === date.toDateString();
  return today ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function linkify(text) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part;
    try {
      const u = new URL(part);
      if (u.origin === location.origin) return <Link key={i} to={u.pathname}>{part}</Link>;
    } catch { /* not a URL */ }
    return <a key={i} href={part} target="_blank" rel="noreferrer noopener">{part}</a>;
  });
}
