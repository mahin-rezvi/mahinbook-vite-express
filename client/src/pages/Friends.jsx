import { useEffect, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fullName, timeAgo } from '../lib/util.js';
import { Avatar, Spinner, Empty } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { MessageButton } from './Profile.jsx';

export default function Friends() {
  const { tab = 'home' } = useParams();
  const { user } = useAuth();
  const nav = [
    ['home', 'Home', 'friends'], ['requests', 'Friend requests', 'userPlus'], ['suggestions', 'Suggestions', 'userPlus'],
    ['all', 'All friends', 'userCheck'], ['sent', 'Sent requests', 'send'], ['birthdays', 'Birthdays', 'calendar'],
  ];
  return (
    <div className="two-col">
      <aside className="sidebar left wide card-side">
        <h2 className="side-title">Friends</h2>
        {nav.map(([k, l, i]) => (
          <NavLink key={k} to={k === 'home' ? '/friends' : `/friends/${k}`} end className="side-item">
            <span className="side-icon round"><Icon name={i} /></span><span className="grow">{l}</span>
            {k === 'requests' && user.pending_requests > 0 && <span className="badge-count static">{user.pending_requests}</span>}
          </NavLink>
        ))}
      </aside>
      <section className="main-col">
        {tab === 'home' && (<><Requests title="Friend requests" compact /><Suggestions title="People you may know" /></>)}
        {tab === 'requests' && <Requests title="Friend requests" />}
        {tab === 'suggestions' && <Suggestions title="People you may know" />}
        {tab === 'all' && <AllFriends />}
        {tab === 'sent' && <Sent />}
        {tab === 'birthdays' && <Birthdays />}
      </section>
    </div>
  );
}

function PersonCard({ p, children, sub }) {
  return (
    <div className="person-card card">
      <Link to={`/profile/${p.username}`} className="person-img">
        {p.avatar_url ? <img src={p.avatar_url} alt="" /> : <Avatar user={p} size={140} />}
      </Link>
      <div className="person-body">
        <Link to={`/profile/${p.username}`} className="strong ellipsis">{fullName(p)}</Link>
        <span className="muted small">{sub ?? (p.mutual_count ? `${p.mutual_count} mutual friend${p.mutual_count > 1 ? 's' : ''}` : ' ')}</span>
        {children}
      </div>
    </div>
  );
}

function Requests({ title, compact }) {
  const { refresh } = useAuth();
  const [list, setList] = useState(null);
  const [done, setDone] = useState({});
  useEffect(() => { api('/friends/requests').then((d) => setList(d.received)); }, []);
  if (!list) return <Spinner />;
  if (compact && !list.length) return null;
  const act = async (id, kind) => {
    await api(`/friends/${kind}/${id}`, { method: 'POST' });
    setDone((d) => ({ ...d, [id]: kind === 'accept' ? 'Request accepted' : 'Request removed' }));
    refresh();
  };
  return (
    <div className="section">
      <div className="row-between"><h2>{title}</h2>{compact && <Link to="/friends/requests" className="link-btn">See all</Link>}</div>
      {!list.length && <Empty icon="userPlus" title="No new requests" text="When you have friend requests, you'll see them here." />}
      <div className="person-grid">
        {list.map((p) => (
          <PersonCard key={p.id} p={p} sub={done[p.id] || undefined}>
            {!done[p.id] && (
              <>
                <button className="btn btn-primary btn-block" onClick={() => act(p.id, 'accept')}>Confirm</button>
                <button className="btn btn-ghost btn-block" onClick={() => act(p.id, 'decline')}>Delete</button>
              </>
            )}
            <span className="muted tiny">{timeAgo(p.created_at)}</span>
          </PersonCard>
        ))}
      </div>
    </div>
  );
}

function Suggestions({ title }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [state, setState] = useState({});
  useEffect(() => { api('/friends/suggestions').then((d) => setList(d.people)); }, []);
  if (!list) return <Spinner />;
  return (
    <div className="section">
      <h2>{title}</h2>
      {!list.length && <Empty icon="friends" title="No suggestions right now" />}
      <div className="person-grid">
        {list.map((p) => (
          <PersonCard key={p.id} p={p}>
            {state[p.id] === 'sent' ? (
              <button className="btn btn-ghost btn-block" onClick={async () => { await api(`/friends/request/${p.id}`, { method: 'DELETE' }); setState((s) => ({ ...s, [p.id]: null })); }}>Cancel</button>
            ) : (
              <button className="btn btn-primary-soft btn-block" onClick={async () => {
                try { const r = await api(`/friends/request/${p.id}`, { method: 'POST' }); setState((s) => ({ ...s, [p.id]: r.relation === 'friends' ? 'friends' : 'sent' })); }
                catch (e) { toast(e.message, 'error'); }
              }}><Icon name="userPlus" size={18} /> {state[p.id] === 'friends' ? 'Friends' : 'Add friend'}</button>
            )}
            <button className="btn btn-ghost btn-block" onClick={() => setList((l) => l.filter((x) => x.id !== p.id))}>Remove</button>
          </PersonCard>
        ))}
      </div>
    </div>
  );
}

function AllFriends() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api('/friends').then((d) => setList(d.friends)); }, []);
  if (!list) return <Spinner />;
  const shown = list.filter((f) => fullName(f).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="section">
      <div className="row-between"><h2>All friends ({list.length})</h2>
        <div className="search-box inline"><Icon name="search" size={16} /><input placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      {!list.length && <Empty icon="friends" title="No friends yet"><Link to="/friends/suggestions" className="btn btn-primary">Find friends</Link></Empty>}
      <div className="person-grid">
        {shown.map((p) => (
          <PersonCard key={p.id} p={p}><MessageButton userId={p.id} className="btn btn-ghost btn-block" /></PersonCard>
        ))}
      </div>
    </div>
  );
}

function Sent() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/friends/requests').then((d) => setList(d.sent)); }, []);
  if (!list) return <Spinner />;
  return (
    <div className="section">
      <h2>Sent requests</h2>
      {!list.length && <Empty icon="send" title="No sent requests" />}
      <div className="person-grid">
        {list.map((p) => (
          <PersonCard key={p.id} p={p}>
            <button className="btn btn-ghost btn-block" onClick={async () => { await api(`/friends/request/${p.id}`, { method: 'DELETE' }); setList((l) => l.filter((x) => x.id !== p.id)); }}>Cancel request</button>
          </PersonCard>
        ))}
      </div>
    </div>
  );
}

function Birthdays() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/friends').then((d) => setList(d.friends.filter((f) => f.birthday))); }, []);
  if (!list) return <Spinner />;
  const now = new Date();
  const next = (b) => {
    const d = new Date(`${b}T00:00:00`);
    const n = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (n < new Date(now.getFullYear(), now.getMonth(), now.getDate())) n.setFullYear(now.getFullYear() + 1);
    return n;
  };
  const sorted = [...list].sort((a, b) => next(a.birthday) - next(b.birthday));
  return (
    <div className="section card pad">
      <h2>Upcoming birthdays</h2>
      {!sorted.length && <p className="muted">None of your friends have shared their birthday.</p>}
      {sorted.map((f) => {
        const n = next(f.birthday);
        const today = n.toDateString() === now.toDateString();
        return (
          <div key={f.id} className="list-row">
            <Avatar user={f} size={48} link />
            <div className="grow"><b>{fullName(f)}</b><div className="muted small">{today ? '🎂 Today!' : n.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div></div>
            {today && <MessageButton userId={f.id} label="Wish happy birthday" className="btn btn-primary btn-sm" />}
          </div>
        );
      })}
    </div>
  );
}
