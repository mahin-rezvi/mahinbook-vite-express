import { useEffect, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fullName, timeAgo, deviceLabel, REACTIONS } from '../lib/util.js';
import { Avatar, Modal, Spinner, Toggle } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const SECTIONS = [
  ['account', 'Personal details', 'user'],
  ['security', 'Password and security', 'shield'],
  ['privacy', 'Privacy', 'lock'],
  ['notifications', 'Notifications', 'bell'],
  ['blocking', 'Blocking', 'block'],
  ['display', 'Display & accessibility', 'moon'],
  ['activity', 'Activity log', 'history'],
  ['information', 'Your information', 'download'],
];

export default function Settings() {
  const { section = 'account' } = useParams();
  return (
    <div className="two-col">
      <aside className="sidebar left wide card-side">
        <h2 className="side-title">Settings & privacy</h2>
        {SECTIONS.map(([k, l, i]) => (
          <NavLink key={k} to={`/settings/${k}`} className={`side-item ${section === k ? 'active' : ''}`}><span className="side-icon round"><Icon name={i} /></span>{l}</NavLink>
        ))}
      </aside>
      <section className="main-col settings">
        {section === 'account' && <Account />}
        {section === 'security' && <Security />}
        {section === 'privacy' && <Privacy />}
        {section === 'notifications' && <NotificationSettings />}
        {section === 'blocking' && <Blocking />}
        {section === 'display' && <Display />}
        {section === 'activity' && <Activity />}
        {section === 'information' && <Information />}
      </section>
    </div>
  );
}

function useSetting() {
  const { setUser } = useAuth();
  const toast = useToast();
  return async (body) => {
    try { setUser(await api('/settings', { method: 'PATCH', body })); toast('Settings saved', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };
}

function Row({ title, desc, children }) {
  return (
    <div className="setting-row">
      <div className="grow"><b>{title}</b>{desc && <div className="muted small">{desc}</div>}</div>
      <div>{children}</div>
    </div>
  );
}

function Account() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [value, setValue] = useState('');
  const [password, setPassword] = useState('');
  async function save() {
    try {
      const body = edit === 'name'
        ? null
        : { [edit]: value, password };
      if (edit === 'name') {
        const [first_name, ...rest] = value.trim().split(' ');
        setUser(await api('/users/me/profile', { method: 'PATCH', body: { first_name, last_name: rest.join(' ') || user.last_name } }));
      } else setUser(await api('/settings/account', { method: 'PATCH', body }));
      toast('Saved', 'success'); setEdit(null); setPassword('');
    } catch (e) { toast(e.message, 'error'); }
  }
  const items = [
    ['name', 'Name', fullName(user)],
    ['username', 'Username', `mahinbook.local/${user.username}`],
    ['email', 'Email', user.email],
    ['phone', 'Mobile number', user.phone || 'Not added'],
  ];
  return (
    <div className="card pad">
      <h2>Personal details</h2>
      <p className="muted">MahinBook uses this information to verify your identity and keep the community safe.</p>
      {items.map(([k, l, v]) => (
        <Row key={k} title={l} desc={v}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEdit(k); setValue(k === 'name' ? fullName(user) : k === 'username' ? user.username : user[k] || ''); }}>Edit</button>
        </Row>
      ))}
      <Row title="Birthday" desc={user.birthday ? new Date(`${user.birthday}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Not set'}>
        <Link className="btn btn-ghost btn-sm" to={`/profile/${user.username}/about`}>Edit on profile</Link>
      </Row>
      {edit && (
        <Modal title={`Edit ${items.find((i) => i[0] === edit)[1].toLowerCase()}`} onClose={() => setEdit(null)} width={440}
          footer={<><button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save changes</button></>}>
          <input className="input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          {(edit === 'email' || edit === 'username') && (
            <input className="input mt" type="password" placeholder="Re-enter your password to confirm" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
          {edit === 'username' && <p className="muted small">5-30 characters: lowercase letters, numbers and periods.</p>}
        </Modal>
      )}
    </div>
  );
}

function Security() {
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '', logout_others: true });
  const [sessions, setSessions] = useState(null);
  const load = () => api('/settings/sessions').then((d) => setSessions(d.sessions));
  useEffect(() => { load(); }, []);
  async function change(e) {
    e.preventDefault();
    if (f.next !== f.confirm) { toast('New passwords do not match', 'error'); return; }
    try { await api('/settings/password', { method: 'POST', body: f }); toast('Password changed', 'success'); setF({ current: '', next: '', confirm: '', logout_others: true }); load(); }
    catch (err) { toast(err.message, 'error'); }
  }
  return (
    <>
      <form className="card pad" onSubmit={change}>
        <h2>Change password</h2>
        <p className="muted">Your password must be at least 6 characters.</p>
        <input className="input" type="password" placeholder="Current password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required />
        <input className="input mt" type="password" placeholder="New password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} minLength={6} required />
        <input className="input mt" type="password" placeholder="Re-type new password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required />
        <label className="check mt"><input type="checkbox" checked={f.logout_others} onChange={(e) => setF({ ...f, logout_others: e.target.checked })} /> Log out of other devices</label>
        <button className="btn btn-primary mt">Change password</button>
      </form>
      <div className="card pad">
        <div className="row-between"><h2>Where you're logged in</h2>
          {sessions?.length > 1 && <button className="btn btn-ghost btn-sm" onClick={async () => { await api('/settings/sessions/others', { method: 'DELETE' }); load(); toast('Logged out of all other sessions'); }}>Log out of all sessions</button>}</div>
        {!sessions && <Spinner />}
        {sessions?.map((s) => (
          <div key={s.id} className="list-row">
            <span className="side-icon round"><Icon name="key" /></span>
            <div className="grow"><b>{deviceLabel(s.user_agent)}</b>
              <div className="muted small">{s.ip} · {s.current ? <span className="success-text">Active now · This device</span> : `Last active ${timeAgo(s.last_seen)}`}</div></div>
            {!s.current && <button className="btn btn-ghost btn-sm" onClick={async () => { await api(`/settings/sessions/${s.id}`, { method: 'DELETE' }); load(); }}>Log out</button>}
          </div>
        ))}
      </div>
    </>
  );
}

function Select({ value, onChange, options }) {
  return <select className="input sm" value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}

function Privacy() {
  const { user } = useAuth();
  const save = useSetting();
  const s = user.settings;
  return (
    <div className="card pad">
      <h2>Privacy</h2>
      <h4 className="section-label">Your activity</h4>
      <Row title="Who can see your future posts?" desc="Default audience when you create a post.">
        <Select value={s.default_audience} onChange={(v) => save({ default_audience: v })} options={[['public', 'Public'], ['friends', 'Friends'], ['only_me', 'Only me']]} />
      </Row>
      <Row title="Who can post on your profile?" desc="Allow friends to write on your timeline.">
        <Select value={s.wall_posting} onChange={(v) => save({ wall_posting: v })} options={[['friends', 'Friends'], ['only_me', 'Only me']]} />
      </Row>
      <h4 className="section-label">How people find and contact you</h4>
      <Row title="Who can send you friend requests?">
        <Select value={s.friend_requests_from} onChange={(v) => save({ friend_requests_from: v })} options={[['everyone', 'Everyone'], ['friends_of_friends', 'Friends of friends']]} />
      </Row>
      <Row title="Who can see your friends list?">
        <Select value={s.friend_list_visibility} onChange={(v) => save({ friend_list_visibility: v })} options={[['public', 'Public'], ['friends', 'Friends'], ['only_me', 'Only me']]} />
      </Row>
      <Row title="Who can look you up using the email address you provided?">
        <Select value={s.lookup_by_email} onChange={(v) => save({ lookup_by_email: v })} options={[['everyone', 'Everyone'], ['friends', 'Friends'], ['only_me', 'Only me']]} />
      </Row>
      <h4 className="section-label">Messaging</h4>
      <Row title="Show when you're active" desc="Friends can see when you're active or recently active. You'll see when they are too.">
        <Toggle checked={s.show_active_status} onChange={(v) => save({ show_active_status: v })} />
      </Row>
      <Row title="Read receipts" desc="When off, people won't see when you've read their messages, and you won't see theirs.">
        <Toggle checked={s.read_receipts} onChange={(v) => save({ read_receipts: v })} />
      </Row>
    </div>
  );
}

function NotificationSettings() {
  const { user } = useAuth();
  const save = useSetting();
  const n = user.settings.notify;
  const items = [
    ['comments', 'Comments', 'Notifications about comments and replies on your posts.'],
    ['reactions', 'Reactions & shares', 'Notifications about reactions and shares of your posts and comments.'],
    ['friend_requests', 'Friend requests', 'Notifications when someone sends or accepts a friend request.'],
    ['groups', 'Groups & events', 'Activity in your groups, invites and join requests.'],
    ['tags', 'Timeline posts', 'When friends post on your profile.'],
    ['messages_sound', 'Message sounds', 'Play a sound for new messages.'],
  ];
  return (
    <div className="card pad">
      <h2>Notifications</h2>
      <p className="muted">Choose what you want to be notified about.</p>
      {items.map(([k, t, d]) => <Row key={k} title={t} desc={d}><Toggle checked={n[k]} onChange={(v) => save({ notify: { [k]: v } })} /></Row>)}
    </div>
  );
}

function Blocking() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const load = () => api('/friends/blocked/list').then((d) => setList(d.blocked));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(() => api(`/search/typeahead?q=${encodeURIComponent(q)}`).then((d) => setResults(d.people)), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="card pad">
      <h2>Blocking</h2>
      <p className="muted">Once you block someone, that person can no longer see things you post on your profile, start a conversation with you, or add you as a friend.</p>
      <div className="search-box inline"><Icon name="search" size={16} /><input placeholder="Type a name to block" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {results.map((p) => (
        <div key={p.id} className="list-row"><Avatar user={p} size={36} /><span className="grow">{fullName(p)}</span>
          <button className="btn btn-danger btn-sm" onClick={async () => { await api(`/friends/block/${p.id}`, { method: 'POST' }); toast(`${p.first_name} blocked`); setQ(''); load(); }}>Block</button></div>
      ))}
      <h4 className="section-label">Blocked users</h4>
      {!list && <Spinner />}
      {list && !list.length && <p className="muted">You haven't blocked anyone.</p>}
      {list?.map((p) => (
        <div key={p.id} className="list-row"><Avatar user={p} size={36} /><span className="grow">{fullName(p)}<span className="muted small"> · blocked {timeAgo(p.created_at)}</span></span>
          <button className="btn btn-ghost btn-sm" onClick={async () => { await api(`/friends/block/${p.id}`, { method: 'DELETE' }); load(); }}>Unblock</button></div>
      ))}
    </div>
  );
}

function Display() {
  const { user } = useAuth();
  const save = useSetting();
  return (
    <div className="card pad">
      <h2>Display & accessibility</h2>
      <h4 className="section-label">Dark mode</h4>
      <p className="muted small">Adjust the appearance of MahinBook to reduce glare and give your eyes a break.</p>
      {[['light', 'Off'], ['dark', 'On'], ['system', 'Automatic — match your device settings']].map(([v, l]) => (
        <label key={v} className="radio-row"><span className="grow">{l}</span>
          <input type="radio" name="theme" checked={user.settings.theme === v} onChange={() => save({ theme: v })} /></label>
      ))}
    </div>
  );
}

function Activity() {
  const [items, setItems] = useState(null);
  useEffect(() => { api('/settings/activity').then((d) => setItems(d.items)); }, []);
  const label = (i) => ({
    post: 'You created a post',
    comment: 'You commented on a post',
    reaction: `You reacted ${REACTIONS[i.extra]?.emoji || ''} to a post`,
    friend: `You became friends with ${i.text}`,
  }[i.kind]);
  return (
    <div className="card pad">
      <h2>Activity log</h2>
      {!items && <Spinner />}
      {items && !items.length && <p className="muted">No activity yet.</p>}
      {items?.map((i, n) => (
        <div key={n} className="list-row">
          <span className="side-icon round"><Icon name={{ post: 'edit', comment: 'comment', reaction: 'like', friend: 'userCheck' }[i.kind]} /></span>
          <div className="grow"><b>{label(i)}</b>{i.text && i.kind !== 'friend' && <div className="muted small ellipsis">"{i.text}"</div>}
            <div className="muted tiny">{new Date(i.created_at).toLocaleString()}</div></div>
          {i.post_id && <Link className="btn btn-ghost btn-sm" to={`/post/${i.post_id}`}>View</Link>}
        </div>
      ))}
    </div>
  );
}

function Information() {
  const { setUser } = useAuth();
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const [password, setPassword] = useState('');
  async function run() {
    try {
      await api(modal === 'deactivate' ? '/settings/deactivate' : '/settings/delete-account', { method: 'POST', body: { password } });
      setUser(null);
    } catch (e) { toast(e.message, 'error'); }
  }
  return (
    <div className="card pad">
      <h2>Your information</h2>
      <Row title="Download your information" desc="Download a copy of your posts, comments, reactions, friends, messages and more (JSON).">
        <a className="btn btn-ghost btn-sm" href="/api/settings/export" download>Download</a>
      </Row>
      <Row title="Access your information" desc="See everything you've done on MahinBook.">
        <Link className="btn btn-ghost btn-sm" to="/settings/activity">Activity log</Link>
      </Row>
      <h4 className="section-label">Deactivation and deletion</h4>
      <Row title="Deactivate account" desc="Temporarily hide your profile. You can reactivate any time by logging back in.">
        <button className="btn btn-ghost btn-sm" onClick={() => setModal('deactivate')}>Deactivate</button>
      </Row>
      <Row title="Delete account" desc="Permanently delete your account, posts, messages and everything else. This can't be undone.">
        <button className="btn btn-danger btn-sm" onClick={() => setModal('delete')}>Delete account</button>
      </Row>
      {modal && (
        <Modal title={modal === 'deactivate' ? 'Deactivate your account?' : 'Permanently delete account?'} onClose={() => setModal(null)} width={440}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={!password} onClick={run}>{modal === 'deactivate' ? 'Deactivate' : 'Delete account'}</button></>}>
          <p>{modal === 'deactivate' ? 'Your profile, posts and comments will be hidden until you log in again.' : 'All your data will be permanently removed. This action cannot be undone.'}</p>
          <input className="input" type="password" placeholder="Enter your password to continue" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Modal>
      )}
    </div>
  );
}
