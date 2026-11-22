import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { fullName } from '../lib/util.js';
import { Avatar } from './ui.jsx';
import Icon from './Icon.jsx';
import { ConvAvatar, convName } from './MessageThread.jsx';

export function LeftSidebar() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [more, setMore] = useState(false);
  useEffect(() => { api('/groups').then((d) => setGroups(d.mine)); }, []);
  const links = [
    ['friends', 'Friends', '/friends', 'c-blue'],
    ['history', 'Memories', '/memories', 'c-blue'],
    ['bookmark', 'Saved', '/saved', 'c-purple'],
    ['groups', 'Groups', '/groups', 'c-blue'],
    ['video', 'Video', '/watch', 'c-blue'],
    ['store', 'Marketplace', '/marketplace', 'c-blue'],
    ['calendar', 'Events', '/events', 'c-red'],
    ['flag', 'Pages', '/pages', 'c-orange'],
    ['chat', 'Messenger', '/messages', 'c-purple'],
    ['settings', 'Settings & privacy', '/settings', 'c-gray'],
  ];
  return (
    <aside className="sidebar left">
      <Link to={`/profile/${user.username}`} className="side-item"><Avatar user={user} size={36} /><span>{fullName(user)}</span></Link>
      {(more ? links : links.slice(0, 6)).map(([icon, label, to, c]) => (
        <Link key={to} to={to} className="side-item"><span className={`side-icon ${c}`}><Icon name={icon} size={22} /></span><span>{label}</span></Link>
      ))}
      <button className="side-item" onClick={() => setMore(!more)}>
        <span className="side-icon c-gray"><Icon name="chevronDown" size={22} style={{ transform: more ? 'rotate(180deg)' : undefined }} /></span>
        <span>{more ? 'See less' : 'See more'}</span>
      </button>
      {!!groups.length && (
        <>
          <div className="side-divider" />
          <h4 className="side-head">Your shortcuts</h4>
          {groups.slice(0, 6).map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className="side-item">
              <span className="group-thumb" style={g.cover_url ? { backgroundImage: `url(${g.cover_url})` } : undefined}>{!g.cover_url && g.name[0]}</span>
              <span className="ellipsis">{g.name}</span>
            </Link>
          ))}
        </>
      )}
      <p className="muted tiny side-foot">Privacy · Terms · Advertising · Cookies · MahinBook © {new Date().getFullYear()}</p>
    </aside>
  );
}

export function RightSidebar() {
  const { user } = useAuth();
  const { openChatWithUser, openChat } = useChat();
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [groupChats, setGroupChats] = useState([]);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);

  const load = () => api('/friends').then((d) => {
    setFriends(d.friends);
  });
  useEffect(() => {
    load();
    api('/friends/requests').then((d) => setRequests(d.received));
    api('/conversations').then((d) => setGroupChats(d.conversations.filter((c) => c.is_group)));
  }, [user.pending_requests]);
  const today = new Date();
  const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const birthdays = friends.filter((f) => f.birthday?.slice(5, 10) === todayMD);
  useSocketEvent('presence', (p) => setFriends((l) => l.map((f) => (f.id === p.user_id ? { ...f, online: p.online, last_active: p.last_active } : f))));

  const sorted = [...friends].sort((a, b) => (b.online - a.online) || a.first_name.localeCompare(b.first_name))
    .filter((f) => fullName(f).toLowerCase().includes(q.toLowerCase()));

  return (
    <aside className="sidebar right">
      {!!requests.length && (
        <>
          <div className="side-head-row"><h4 className="side-head">Friend requests</h4><Link to="/friends/requests" className="link-btn">See all</Link></div>
          <MiniRequest r={requests[0]} onDone={() => setRequests((l) => l.slice(1))} />
          <div className="side-divider" />
        </>
      )}
      {!!birthdays.length && (
        <>
          <h4 className="side-head">Birthdays</h4>
          <div className="side-item static"><span className="side-icon">🎁</span>
            <span><b>{birthdays[0].first_name}</b>{birthdays.length > 1 ? ` and ${birthdays.length - 1} others have` : ' has'} a birthday today.</span></div>
          <div className="side-divider" />
        </>
      )}
      <div className="side-head-row">
        <h4 className="side-head">Contacts</h4>
        <button className="icon-btn sm" title="Search by name" onClick={() => setSearching(!searching)}><Icon name="search" size={16} /></button>
      </div>
      {searching && <input className="input sm" autoFocus placeholder="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} />}
      {sorted.map((f) => (
        <button key={f.id} className="side-item" onClick={() => openChatWithUser(f.id)}>
          <Avatar user={f} size={36} online={f.online} /><span>{fullName(f)}</span>
        </button>
      ))}
      {!friends.length && <p className="muted small pad">Add friends to see them here.</p>}
      {!!groupChats.length && (
        <>
          <div className="side-divider" />
          <h4 className="side-head">Group conversations</h4>
          {groupChats.map((c) => (
            <button key={c.id} className="side-item" onClick={() => openChat(c.id)}>
              <ConvAvatar c={c} me={user.id} size={36} /><span className="ellipsis">{convName(c, user.id)}</span>
            </button>
          ))}
        </>
      )}
    </aside>
  );
}

function MiniRequest({ r, onDone }) {
  const { refresh } = useAuth();
  return (
    <div className="mini-request">
      <Avatar user={r} size={56} link />
      <div className="grow">
        <div className="row-between"><Link to={`/profile/${r.username}`} className="strong">{fullName(r)}</Link></div>
        {r.mutual_count > 0 && <div className="muted small">{r.mutual_count} mutual friends</div>}
        <div className="btn-row">
          <button className="btn btn-primary btn-sm" onClick={async () => { await api(`/friends/accept/${r.id}`, { method: 'POST' }); refresh(); onDone(); }}>Confirm</button>
          <button className="btn btn-ghost btn-sm" onClick={async () => { await api(`/friends/decline/${r.id}`, { method: 'POST' }); refresh(); onDone(); }}>Delete</button>
        </div>
      </div>
    </div>
  );
}
