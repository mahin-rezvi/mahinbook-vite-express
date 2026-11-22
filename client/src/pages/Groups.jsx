import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fullName } from '../lib/util.js';
import { Avatar, Modal, Confirm, Menu, Spinner, Empty, FilePicker, useObjectUrls } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import Composer from '../components/Composer.jsx';
import PostList from '../components/PostList.jsx';
import { PeoplePicker } from '../components/NewMessage.jsx';

export default function Groups() {
  const [data, setData] = useState(null);
  const [view, setView] = useState('feed');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const load = () => api('/groups').then(setData);
  useEffect(() => { load(); }, []);
  return (
    <div className="two-col">
      <aside className="sidebar left wide card-side">
        <h2 className="side-title">Groups</h2>
        <button className={`side-item ${view === 'feed' ? 'active' : ''}`} onClick={() => setView('feed')}><span className="side-icon round"><Icon name="home" /></span>Your feed</button>
        <button className={`side-item ${view === 'discover' ? 'active' : ''}`} onClick={() => setView('discover')}><span className="side-icon round"><Icon name="search" /></span>Discover</button>
        <button className="btn btn-primary-soft btn-block" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> Create new group</button>
        <div className="side-divider" />
        <h4 className="side-head">Groups you've joined</h4>
        {data?.mine.map((g) => (
          <Link key={g.id} to={`/groups/${g.id}`} className="side-item">
            <span className="group-thumb lg" style={g.cover_url ? { backgroundImage: `url(${g.cover_url})` } : undefined}>{!g.cover_url && g.name[0]}</span>
            <span><span className="ellipsis strong">{g.name}</span><span className="muted tiny block">{g.my_role === 'admin' ? 'Admin' : 'Member'}</span></span>
          </Link>
        ))}
      </aside>
      <section className="main-col">
        {view === 'feed' ? (
          <div className="feed">
            <h3 className="muted">Recent activity</h3>
            <PostList endpoint="/groups/feed" empty={<Empty icon="groups" title="No group posts yet" text="Join groups to see their posts here."><button className="btn btn-primary" onClick={() => setView('discover')}>Discover groups</button></Empty>} />
          </div>
        ) : (
          <div className="section">
            <h2>Suggested for you</h2>
            <div className="person-grid">
              {data?.discover.map((g) => <GroupCard key={g.id} g={g} onJoined={load} />)}
            </div>
            {data && !data.discover.length && <Empty icon="groups" title="No more groups to discover" />}
          </div>
        )}
      </section>
      {creating && <CreateGroup onClose={() => setCreating(false)} onCreated={(g) => navigate(`/groups/${g.id}`)} />}
    </div>
  );
}

function GroupCard({ g, onJoined }) {
  const [status, setStatus] = useState(g.my_status);
  return (
    <div className="person-card card">
      <Link to={`/groups/${g.id}`} className="person-img group-cover" style={g.cover_url ? { backgroundImage: `url(${g.cover_url})` } : undefined}>{!g.cover_url && <Icon name="groups" size={48} />}</Link>
      <div className="person-body">
        <Link to={`/groups/${g.id}`} className="strong ellipsis">{g.name}</Link>
        <span className="muted small">{g.privacy === 'private' ? 'Private' : 'Public'} · {g.member_count} members{g.friends_in_group ? ` · ${g.friends_in_group} friends` : ''}</span>
        <button className="btn btn-primary-soft btn-block" disabled={!!status} onClick={async () => { const r = await api(`/groups/${g.id}/join`, { method: 'POST' }); setStatus(r.status); onJoined?.(); }}>
          {status === 'member' ? 'Joined' : status === 'pending' ? 'Requested' : 'Join group'}
        </button>
      </div>
    </div>
  );
}

function CreateGroup({ onClose, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('public');
  const [cover, setCover] = useState(null);
  const [invite, setInvite] = useState([]);
  const [url] = useObjectUrls(cover ? [cover] : []);
  async function create() {
    try {
      onCreated(await api('/groups', { method: 'POST', form: { name, description, privacy, cover, invite: JSON.stringify(invite.map((i) => i.id)) } }));
    } catch (e) { toast(e.message, 'error'); }
  }
  return (
    <Modal title="Create group" onClose={onClose} width={560} footer={<button className="btn btn-primary" disabled={!name.trim()} onClick={create}>Create</button>}>
      <div className="form-grid">
        <label className="field span2"><span>Group name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label className="field span2"><span>Choose privacy</span>
          <select className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
            <option value="public">Public — Anyone can see who's in the group and what they post.</option>
            <option value="private">Private — Only members can see who's in the group and what they post.</option>
          </select></label>
        <label className="field span2"><span>Description</span><textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="field span2"><span>Cover photo</span>
          {url ? <img src={url} className="cover-preview" alt="" /> : null}
          <FilePicker onFiles={(f) => setCover(f[0])} className="btn btn-ghost"><Icon name="photo" size={18} /> {cover ? 'Change' : 'Upload'} cover</FilePicker>
        </div>
        <div className="field span2"><span>Invite friends (optional)</span><PeoplePicker selected={invite} setSelected={setInvite} friendsOnly /></div>
      </div>
    </Modal>
  );
}

export function GroupDetail() {
  const { id, tab = 'discussion' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [g, setG] = useState(null);
  const [modal, setModal] = useState(null);
  const list = useRef();
  const register = useCallback((a) => { list.current = a; }, []);
  const load = () => api(`/groups/${id}`).then(setG).catch(() => setG(false));
  useEffect(() => { load(); }, [id]);
  if (g === false) return <div className="page-narrow"><Empty icon="groups" title="Group not found" /></div>;
  if (!g) return <div className="center-pad"><Spinner /></div>;
  const member = g.my_status === 'member';
  const admin = g.my_role === 'admin';
  const canSee = g.privacy === 'public' || member;

  return (
    <div className="profile">
      <div className="profile-header">
        <div className="cover group" style={g.cover_url ? { backgroundImage: `url(${g.cover_url})` } : undefined} />
        <div className="group-bar">
          <h1>{g.name}</h1>
          <span className="muted"><Icon name={g.privacy === 'private' ? 'lock' : 'globe'} size={14} /> {g.privacy === 'private' ? 'Private' : 'Public'} group · {g.member_count} members</span>
          <div className="profile-actions">
            {member ? (
              <>
                <button className="btn btn-primary" onClick={() => setModal('invite')}><Icon name="plus" size={18} /> Invite</button>
                <Menu trigger={<button className="btn btn-ghost"><Icon name="userCheck" size={18} /> Joined <Icon name="chevronDown" size={14} /></button>} items={[
                  admin && { icon: 'settings', label: 'Group settings', onClick: () => setModal('settings') },
                  { icon: 'logout', label: 'Leave group', danger: true, onClick: () => setModal('leave') },
                  admin && { icon: 'trash', label: 'Delete group', danger: true, onClick: () => setModal('delete') },
                ]} />
              </>
            ) : g.my_status === 'pending' ? (
              <button className="btn btn-ghost" onClick={async () => { await api(`/groups/${id}/join`, { method: 'DELETE' }); load(); }}>Cancel request</button>
            ) : (
              <button className="btn btn-primary" onClick={async () => { const r = await api(`/groups/${id}/join`, { method: 'POST' }); toast(r.status === 'pending' ? 'Request sent to admins' : 'You joined the group', 'success'); load(); }}>
                <Icon name="groups" size={18} /> Join group
              </button>
            )}
          </div>
        </div>
        <nav className="profile-tabs">
          {[['discussion', 'Discussion'], ['members', 'Members'], ['about', 'About']].map(([k, l]) => (
            <Link key={k} to={`/groups/${id}${k === 'discussion' ? '' : `/${k}`}`} className={`ptab ${tab === k ? 'active' : ''}`}>{l}</Link>
          ))}
        </nav>
      </div>

      {tab === 'discussion' && (
        <div className="profile-body">
          <div className="profile-side"><GroupAbout g={g} /></div>
          <div className="profile-main">
            {member && <Composer groupId={g.id} placeholder="Write something..." onCreated={(p) => list.current?.prepend(p)} />}
            {canSee ? <PostList endpoint={`/groups/${g.id}/posts`} register={register} empty={<Empty icon="comment" title="No posts yet" text="Be the first to post in this group." />} />
              : <Empty icon="lock" title="This group is private" text="Join this group to view or participate in discussions." />}
          </div>
        </div>
      )}
      {tab === 'members' && <div className="page-narrow">{canSee || admin ? <GroupMembers g={g} admin={admin} me={user.id} /> : <Empty icon="lock" title="Members are private" />}</div>}
      {tab === 'about' && <div className="page-narrow"><GroupAbout g={g} /></div>}

      {modal === 'invite' && <InviteModal g={g} onClose={() => setModal(null)} />}
      {modal === 'settings' && <GroupSettings g={g} onClose={() => setModal(null)} onSaved={(x) => { setG({ ...g, ...x }); setModal(null); }} />}
      {modal === 'leave' && <Confirm title="Leave group?" danger confirmLabel="Leave group" text={`Are you sure you want to leave ${g.name}?`} onClose={() => setModal(null)}
        onConfirm={async () => { await api(`/groups/${id}/join`, { method: 'DELETE' }); load(); }} />}
      {modal === 'delete' && <Confirm title="Delete group?" danger confirmLabel="Delete" text="This will permanently delete the group and all its posts." onClose={() => setModal(null)}
        onConfirm={async () => { await api(`/groups/${id}`, { method: 'DELETE' }); navigate('/groups'); }} />}
    </div>
  );
}

function GroupAbout({ g }) {
  return (
    <div className="card pad">
      <h3>About this group</h3>
      {g.description && <p>{g.description}</p>}
      <div className="about-row"><Icon name={g.privacy === 'private' ? 'lock' : 'globe'} className="muted" />
        <span><b>{g.privacy === 'private' ? 'Private' : 'Public'}</b><br /><span className="muted small">{g.privacy === 'private' ? "Only members can see who's in the group and what they post." : "Anyone can see who's in the group and what they post."}</span></span></div>
      <div className="about-row"><Icon name="eye" className="muted" /><span><b>Visible</b><br /><span className="muted small">Anyone can find this group.</span></span></div>
      <div className="about-row"><Icon name="history" className="muted" /><span>Created {new Date(g.created_at).toLocaleDateString()}</span></div>
      {!!g.admins?.length && (
        <>
          <h4 className="section-label">Admins</h4>
          {g.admins.map((a) => <div key={a.user.id} className="list-row"><Avatar user={a.user} size={32} link /><span>{fullName(a.user)}</span></div>)}
        </>
      )}
    </div>
  );
}

function GroupMembers({ g, admin, me }) {
  const [members, setMembers] = useState(null);
  const load = () => api(`/groups/${g.id}/members`).then((d) => setMembers(d.members));
  useEffect(() => { load(); }, [g.id]);
  if (!members) return <Spinner />;
  const pending = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status === 'member');
  return (
    <>
      {admin && !!pending.length && (
        <div className="card pad">
          <h3>Member requests · {pending.length}</h3>
          {pending.map((m) => (
            <div key={m.user.id} className="list-row">
              <Avatar user={m.user} size={40} link /><b className="grow">{fullName(m.user)}</b>
              <button className="btn btn-primary btn-sm" onClick={async () => { await api(`/groups/${g.id}/members/${m.user.id}/approve`, { method: 'POST' }); load(); }}>Approve</button>
              <button className="btn btn-ghost btn-sm" onClick={async () => { await api(`/groups/${g.id}/members/${m.user.id}`, { method: 'DELETE' }); load(); }}>Decline</button>
            </div>
          ))}
        </div>
      )}
      <div className="card pad">
        <h3>Members · {active.length}</h3>
        {active.map((m) => (
          <div key={m.user.id} className="list-row">
            <Avatar user={m.user} size={48} link />
            <div className="grow"><Link to={`/profile/${m.user.username}`} className="strong">{fullName(m.user)}</Link>
              <div className="muted small">{m.role === 'admin' ? 'Admin' : `Joined ${new Date(m.joined_at).toLocaleDateString()}`}{m.is_friend ? ' · Friend' : ''}</div></div>
            {admin && m.user.id !== me && (
              <Menu trigger={<button className="icon-btn"><Icon name="dots" /></button>} items={[
                { icon: 'shield', label: m.role === 'admin' ? 'Remove as admin' : 'Make admin', onClick: async () => { await api(`/groups/${g.id}/members/${m.user.id}`, { method: 'PATCH', body: { role: m.role === 'admin' ? 'member' : 'admin' } }); load(); } },
                { icon: 'userX', label: 'Remove member', danger: true, onClick: async () => { await api(`/groups/${g.id}/members/${m.user.id}`, { method: 'DELETE' }); load(); } },
              ]} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function InviteModal({ g, onClose }) {
  const toast = useToast();
  const [sel, setSel] = useState([]);
  return (
    <Modal title="Invite friends to this group" onClose={onClose} width={460} footer={
      <button className="btn btn-primary" disabled={!sel.length} onClick={async () => { await api(`/groups/${g.id}/invite`, { method: 'POST', body: { user_ids: sel.map((s) => s.id) } }); toast('Invites sent', 'success'); onClose(); }}>Send invites</button>
    }>
      <PeoplePicker selected={sel} setSelected={setSel} friendsOnly />
    </Modal>
  );
}

function GroupSettings({ g, onClose, onSaved }) {
  const [name, setName] = useState(g.name);
  const [description, setDescription] = useState(g.description);
  const [privacy, setPrivacy] = useState(g.privacy);
  const [cover, setCover] = useState(null);
  return (
    <Modal title="Group settings" onClose={onClose} width={520} footer={
      <button className="btn btn-primary" onClick={async () => onSaved(await api(`/groups/${g.id}`, { method: 'PATCH', form: { name, description, privacy, cover } }))}>Save</button>
    }>
      <div className="form-grid">
        <label className="field span2"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field span2"><span>Description</span><textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="field span2"><span>Privacy</span><select className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value)}><option value="public">Public</option><option value="private">Private</option></select></label>
        <div className="field span2"><span>Cover</span><FilePicker onFiles={(f) => setCover(f[0])} className="btn btn-ghost"><Icon name="photo" size={18} /> {cover ? cover.name : 'Change cover'}</FilePicker></div>
      </div>
    </Modal>
  );
}
