import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fullName, timeAgo, notificationText, notificationLink } from '../lib/util.js';
import { Avatar, Spinner, Tabs } from './ui.jsx';
import Icon from './Icon.jsx';
import { ConvAvatar, convName } from './MessageThread.jsx';
import NewMessage from './NewMessage.jsx';

export function Logo({ size = 40 }) {
  return (
    <span className="logo" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-label="MahinBook">mb</span>
  );
}

function useOutside(ref, open, close) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => !ref.current?.contains(e.target) && close();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
}

export default function Navbar() {
  const { user, logout, bump, refresh, setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [panel, setPanel] = useState(null);
  const ref = useRef();
  useOutside(ref, !!panel, () => setPanel(null));

  useSocketEvent('notification', (n) => {
    bump('unread_notifications', 1);
    if (n.type === 'friend_request') bump('pending_requests', 1);
    toast(`${fullName(n.actor)} ${notificationText(n)}`);
  });
  useSocketEvent('reconnect', refresh);

  const toggle = (p) => setPanel((cur) => (cur === p ? null : p));

  return (
    <header className="navbar">
      <div className="nav-left">
        <Link to="/" aria-label="Home"><Logo /></Link>
        <SearchBox />
      </div>
      <nav className="nav-center">
        <NavLink to="/" end className="nav-tab" title="Home"><Icon name="home" size={26} /></NavLink>
        <NavLink to="/friends" className="nav-tab" title="Friends"><Icon name="friends" size={26} />
          {user.pending_requests > 0 && <span className="badge-count">{user.pending_requests}</span>}</NavLink>
        <NavLink to="/watch" className="nav-tab" title="Video"><Icon name="video" size={26} /></NavLink>
        <NavLink to="/marketplace" className="nav-tab" title="Marketplace"><Icon name="store" size={26} /></NavLink>
        <NavLink to="/groups" className="nav-tab" title="Groups"><Icon name="groups" size={26} /></NavLink>
      </nav>
      <div className="nav-right" ref={ref}>
        <button className={`round-btn ${panel === 'menu' ? 'on' : ''}`} onClick={() => toggle('menu')} title="Menu"><Icon name="grid" /></button>
        <button className={`round-btn ${panel === 'messenger' ? 'on' : ''}`} onClick={() => toggle('messenger')} title="Messenger">
          <Icon name="chat" />{user.unread_conversations > 0 && <span className="badge-count">{user.unread_conversations}</span>}
        </button>
        <button className={`round-btn ${panel === 'notifications' ? 'on' : ''}`} onClick={() => toggle('notifications')} title="Notifications">
          <Icon name="bell" />{user.unread_notifications > 0 && <span className="badge-count">{user.unread_notifications}</span>}
        </button>
        <button className="round-btn avatar-btn" onClick={() => toggle('account')} title="Account"><Avatar user={user} size={40} /></button>

        {panel === 'menu' && <MenuPanel close={() => setPanel(null)} />}
        {panel === 'messenger' && <MessengerPanel close={() => setPanel(null)} />}
        {panel === 'notifications' && <NotificationsPanel close={() => setPanel(null)} />}
        {panel === 'account' && (
          <div className="dropdown card account-panel">
            <Link to={`/profile/${user.username}`} className="account-card" onClick={() => setPanel(null)}>
              <Avatar user={user} size={40} /><b>{fullName(user)}</b>
            </Link>
            <div className="menu-divider" />
            <Link className="menu-item" to="/settings" onClick={() => setPanel(null)}><span className="round"><Icon name="settings" /></span>Settings & privacy</Link>
            <Link className="menu-item" to="/settings/activity" onClick={() => setPanel(null)}><span className="round"><Icon name="history" /></span>Activity log</Link>
            <button className="menu-item" onClick={async () => {
              const theme = user.settings.theme === 'dark' ? 'light' : 'dark';
              setUser({ ...user, settings: { ...user.settings, theme } });
              await api('/settings', { method: 'PATCH', body: { theme } });
            }}><span className="round"><Icon name="moon" /></span>Dark mode: {user.settings.theme === 'dark' ? 'On' : 'Off'}</button>
            <button className="menu-item" onClick={async () => { await logout(); navigate('/'); }}><span className="round"><Icon name="logout" /></span>Log out</button>
            <p className="muted tiny pad">Privacy · Terms · Cookies · MahinBook © {new Date().getFullYear()}</p>
          </div>
        )}
      </div>
    </header>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem('mb_recent') || '[]'); } catch { return []; } });
  const ref = useRef();
  useOutside(ref, open, () => setOpen(false));
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(() => api(`/search/typeahead?q=${encodeURIComponent(q)}`).then((d) => setResults(d.people)), 180);
    return () => clearTimeout(t);
  }, [q]);
  const remember = (term) => {
    const next = [term, ...recent.filter((r) => r !== term)].slice(0, 8);
    setRecent(next);
    try { localStorage.setItem('mb_recent', JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const go = (term) => { if (!term.trim()) return; remember(term); setOpen(false); navigate(`/search?q=${encodeURIComponent(term)}`); };
  return (
    <div className="search-box" ref={ref}>
      <Icon name="search" size={16} />
      <input placeholder="Search MahinBook" value={q} onFocus={() => setOpen(true)} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go(q)} aria-label="Search" />
      {open && (
        <div className="dropdown card search-drop">
          {!q && <div className="drop-head"><b>Recent</b>{!!recent.length && <button className="link-btn" onClick={() => { setRecent([]); localStorage.removeItem('mb_recent'); }}>Clear</button>}</div>}
          {!q && recent.map((r) => (
            <button key={r} className="menu-item" onClick={() => go(r)}><span className="round"><Icon name="history" size={16} /></span>{r}</button>
          ))}
          {!q && !recent.length && <p className="muted pad">No recent searches</p>}
          {results.map((p) => (
            <button key={p.id} className="menu-item" onClick={() => { remember(fullName(p)); setOpen(false); setQ(''); navigate(`/profile/${p.username}`); }}>
              <Avatar user={p} size={36} /><span><span className="menu-label">{fullName(p)}</span>{p.is_friend && <span className="menu-hint">Friend</span>}</span>
            </button>
          ))}
          {q && <button className="menu-item" onClick={() => go(q)}><span className="round primary"><Icon name="search" size={16} /></span>Search for <b>&nbsp;{q}</b></button>}
        </div>
      )}
    </div>
  );
}

function MenuPanel({ close }) {
  const items = [
    ['friends', 'Friends', '/friends', 'Search for friends or people you may know.'],
    ['groups', 'Groups', '/groups', 'Connect with people who share your interests.'],
    ['store', 'Marketplace', '/marketplace', 'Buy and sell in your community.'],
    ['calendar', 'Events', '/events', 'Organize or find events near you.'],
    ['flag', 'Pages', '/pages', 'Discover and connect with businesses.'],
    ['bookmark', 'Saved', '/saved', 'Find posts, photos and videos you saved.'],
    ['video', 'Video', '/watch', 'Watch videos from friends and groups.'],
    ['history', 'Memories', '/memories', 'Browse your old photos and posts.'],
  ];
  return (
    <div className="dropdown card menu-panel">
      <h2>Menu</h2>
      <div className="menu-grid">
        {items.map(([icon, label, to, hint]) => (
          <Link key={to} to={to} onClick={close} className="menu-item">
            <span className="round"><Icon name={icon} /></span>
            <span><span className="menu-label">{label}</span><span className="menu-hint">{hint}</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MessengerPanel({ close }) {
  const { user } = useAuth();
  const { openChat } = useChat();
  const [convs, setConvs] = useState(null);
  const [q, setQ] = useState('');
  const [composing, setComposing] = useState(false);
  useEffect(() => { api('/conversations').then((d) => setConvs(d.conversations)); }, []);
  const shown = (convs || []).filter((c) => convName(c, user.id).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="dropdown card messenger-panel">
      <div className="drop-head">
        <h2>Chats</h2>
        <div>
          <button className="icon-btn" title="New message" onClick={() => setComposing(true)}><Icon name="edit" /></button>
          <Link to="/messages" className="icon-btn" onClick={close} title="See all in Messenger"><Icon name="chat" /></Link>
        </div>
      </div>
      <div className="search-box inline"><Icon name="search" size={16} /><input placeholder="Search Messenger" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!convs && <Spinner />}
      {convs && !shown.length && <p className="muted pad">No messages yet</p>}
      {shown.map((c) => <ConversationRow key={c.id} c={c} me={user.id} onClick={() => { openChat(c.id); close(); }} />)}
      <Link to="/messages" className="link-btn center-block" onClick={close}>See all in Messenger</Link>
      {composing && <NewMessage onClose={() => setComposing(false)} onOpen={(c) => { setComposing(false); openChat(c.id); close(); }} />}
    </div>
  );
}

export function ConversationRow({ c, me, onClick, active }) {
  const lm = c.last_message;
  const unread = c.unread > 0;
  let preview = '';
  if (lm) {
    const who = lm.sender_id === me ? 'You: ' : c.is_group ? `${c.members.find((m) => m.id === lm.sender_id)?.first_name || ''}: ` : '';
    preview = lm.deleted ? `${lm.sender_id === me ? 'You' : 'They'} unsent a message`
      : lm.kind === 'system' ? `${lm.sender_id === me ? 'You' : c.members.find((m) => m.id === lm.sender_id)?.first_name} ${lm.content}`
      : who + (lm.content || (lm.image_url ? 'sent a photo' : ''));
  }
  return (
    <button className={`conv-row ${unread ? 'unread' : ''} ${active ? 'active' : ''}`} onClick={onClick}>
      <ConvAvatar c={c} me={me} size={52} />
      <span className="conv-text">
        <span className="conv-name ellipsis">{convName(c, me)}</span>
        <span className="conv-preview"><span className="ellipsis">{preview}</span>{lm && <span> · {timeAgo(lm.created_at, { short: true })}</span>}</span>
      </span>
      {c.muted && <Icon name="mute" size={14} className="muted" />}
      {unread && <span className="unread-dot" />}
    </button>
  );
}

function NotificationsPanel({ close }) {
  const [tab, setTab] = useState('all');
  return (
    <div className="dropdown card notif-panel">
      <div className="drop-head"><h2>Notifications</h2><Link to="/notifications" onClick={close} className="link-btn">See all</Link></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} />
      <NotificationList unreadOnly={tab === 'unread'} onNavigate={close} limit={12} />
    </div>
  );
}

export function NotificationList({ unreadOnly, onNavigate, limit }) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [list, setList] = useState(null);
  const load = () => api(`/notifications${unreadOnly ? '?unread=1' : ''}`).then((d) => setList(d.notifications));
  useEffect(() => { load(); }, [unreadOnly]);
  useSocketEvent('notification', (n) => setList((l) => (l ? [n, ...l] : l)));
  if (!list) return <Spinner />;
  const shown = limit ? list.slice(0, limit) : list;
  return (
    <div className="notif-list">
      {!!list.length && (
        <div className="drop-head small"><b>Earlier</b>
          <button className="link-btn" onClick={async () => { await api('/notifications/read-all', { method: 'POST' }); refresh(); load(); }}>Mark all as read</button>
        </div>
      )}
      {!list.length && <p className="muted pad center">{unreadOnly ? "You're all caught up!" : 'You have no notifications'}</p>}
      {shown.map((n) => (
        <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`}>
          <button className="notif-main" onClick={async () => {
            if (!n.read) { await api(`/notifications/${n.id}/read`, { method: 'POST', body: {} }); refresh(); }
            onNavigate?.();
            navigate(notificationLink(n));
          }}>
            <span className="avatar-badge"><Avatar user={n.actor} size={52} /><span className={`nb nb-${n.type}`}><Icon name={NOTIF_ICON[n.type] || 'bell'} size={12} /></span></span>
            <span className="notif-text">
              <span><b>{fullName(n.actor)}</b> {notificationText(n)}</span>
              <span className={`small ${n.read ? 'muted' : 'primary-text'}`}>{timeAgo(n.created_at)}</span>
            </span>
            {!n.read && <span className="unread-dot" />}
          </button>
          {n.type === 'friend_request' && <FriendRequestActions userId={n.actor?.id} />}
          <div className="notif-menu">
            <button className="icon-btn sm" title={n.read ? 'Mark as unread' : 'Mark as read'} onClick={async () => {
              await api(`/notifications/${n.id}/read`, { method: 'POST', body: { unread: n.read } }); refresh();
              setList((l) => l.map((x) => (x.id === n.id ? { ...x, read: !x.read } : x)));
            }}><Icon name="check" size={14} /></button>
            <button className="icon-btn sm" title="Remove this notification" onClick={async () => {
              await api(`/notifications/${n.id}`, { method: 'DELETE' }); refresh();
              setList((l) => l.filter((x) => x.id !== n.id));
            }}><Icon name="x" size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

const NOTIF_ICON = {
  friend_request: 'userPlus', friend_accept: 'userCheck', reaction: 'like', comment: 'comment', reply: 'comment',
  comment_like: 'like', share: 'share', wall_post: 'edit', group_join_request: 'groups', group_approved: 'groups',
  group_invite: 'groups', group_post: 'groups', event_invite: 'calendar', page_follow: 'flag',
};

function FriendRequestActions({ userId }) {
  const { refresh } = useAuth();
  const [state, setState] = useState(null);
  if (!userId) return null;
  if (state) return <p className="muted small notif-actions">{state === 'friends' ? 'Request accepted' : 'Request removed'}</p>;
  return (
    <div className="notif-actions">
      <button className="btn btn-primary btn-sm" onClick={async () => { try { await api(`/friends/accept/${userId}`, { method: 'POST' }); } catch { /* already handled */ } setState('friends'); refresh(); }}>Confirm</button>
      <button className="btn btn-ghost btn-sm" onClick={async () => { await api(`/friends/decline/${userId}`, { method: 'POST' }); setState('none'); refresh(); }}>Delete</button>
    </div>
  );
}
