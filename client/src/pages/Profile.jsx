import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fullName, activeLabel } from '../lib/util.js';
import { Avatar, Menu, Modal, Confirm, FilePicker, Spinner, Empty, Media } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import Composer from '../components/Composer.jsx';
import PostList from '../components/PostList.jsx';
import { PhotoViewer } from '../components/PostCard.jsx';

export default function Profile() {
  const { username, tab = 'posts' } = useParams();
  const { user: me, setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const list = useRef();
  const register = useCallback((a) => { list.current = a; }, []);

  const load = useCallback(() => api(`/users/${username}`).then(setP).catch((e) => setError(e.message)), [username]);
  useEffect(() => { setP(null); setError(null); load(); }, [load]);

  if (error) return <div className="page-narrow"><Empty icon="block" title="This content isn't available right now" text="The link may be broken, or the profile may have been removed."><Link to="/" className="btn btn-primary">Go to News Feed</Link></Empty></div>;
  if (!p) return <div className="center-pad"><Spinner size={36} /></div>;
  const self = p.relation === 'self';

  async function uploadPic(kind, file) {
    try {
      const u = await api(`/users/me/${kind}`, { method: 'POST', form: { file } });
      setUser(u);
      setP((x) => ({ ...x, avatar_url: u.avatar_url, cover_url: u.cover_url }));
      toast(kind === 'avatar' ? 'Profile picture updated' : 'Cover photo updated', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  const tabs = [['posts', 'Posts'], ['about', 'About'], ['friends', 'Friends'], ['photos', 'Photos']];

  return (
    <div className="profile">
      <div className="profile-header">
        <div className="cover" style={p.cover_url ? { backgroundImage: `url(${p.cover_url})` } : undefined}>
          {self && (
            <Menu align="right" className="cover-btn" trigger={<button className="btn btn-light"><Icon name="camera" size={18} /> {p.cover_url ? 'Edit cover photo' : 'Add cover photo'}</button>}>
              <FilePicker onFiles={(f) => uploadPic('cover', f[0])} className="menu-item"><Icon name="photo" /> Upload photo</FilePicker>
              {p.cover_url && <button className="menu-item danger" onClick={async () => { const u = await api('/users/me/cover', { method: 'DELETE' }); setUser(u); setP({ ...p, cover_url: null }); }}><Icon name="trash" /> Remove</button>}
            </Menu>
          )}
        </div>
        <div className="profile-bar">
          <div className="profile-avatar">
            <Avatar user={p} size={168} />
            {self && (
              <FilePicker onFiles={(f) => uploadPic('avatar', f[0])} className="avatar-cam round-btn" aria-label="Update profile picture"><Icon name="camera" /></FilePicker>
            )}
          </div>
          <div className="profile-id">
            <h1>{fullName(p)}</h1>
            <Link to={`/profile/${p.username}/friends`} className="muted strong">{p.friend_count} friends{!self && p.mutual_count > 0 && ` · ${p.mutual_count} mutual`}</Link>
            <div className="friend-faces">{p.friends_preview.slice(0, 8).map((f) => <Avatar key={f.id} user={f} size={32} link />)}</div>
            {!self && p.online && <span className="small primary-text">● {activeLabel(p)}</span>}
          </div>
          <div className="profile-actions">
            {self ? (
              <>
                <button className="btn btn-primary" onClick={() => navigate('/')}><Icon name="plus" size={18} /> Add to story</button>
                <button className="btn btn-ghost" onClick={() => setModal('edit')}><Icon name="edit" size={18} /> Edit profile</button>
              </>
            ) : p.blocked_by_me ? (
              <button className="btn btn-ghost" onClick={async () => { await api(`/friends/block/${p.id}`, { method: 'DELETE' }); load(); }}>Unblock</button>
            ) : (
              <>
                <FriendButton p={p} onChange={(relation) => setP({ ...p, relation })} />
                <MessageButton userId={p.id} />
                <Menu trigger={<button className="btn btn-ghost" aria-label="More"><Icon name="dots" /></button>} items={[
                  { icon: 'link', label: 'Copy link to profile', onClick: () => { navigator.clipboard?.writeText(location.href); toast('Link copied'); } },
                  { icon: 'search', label: 'Search', onClick: () => navigate(`/search?q=${encodeURIComponent(p.first_name)}`) },
                  { icon: 'block', label: 'Block', danger: true, onClick: () => setModal('block') },
                ]} />
              </>
            )}
          </div>
        </div>
        <nav className="profile-tabs">
          {tabs.map(([k, l]) => <Link key={k} to={`/profile/${p.username}${k === 'posts' ? '' : `/${k}`}`} className={`ptab ${tab === k ? 'active' : ''}`}>{l}</Link>)}
        </nav>
      </div>

      {p.blocked_by_me ? (
        <div className="page-narrow"><Empty icon="block" title={`You blocked ${p.first_name}`} text="Unblock them to see their posts and interact again." /></div>
      ) : tab === 'posts' ? (
        <div className="profile-body">
          <div className="profile-side">
            <Intro p={p} self={self} onEdit={() => setModal('edit')} />
            <PhotosCard p={p} />
            <div className="card pad">
              <div className="row-between"><h3>Friends</h3><Link className="link-btn" to={`/profile/${p.username}/friends`}>See all friends</Link></div>
              <p className="muted">{p.friend_count} friends</p>
              <div className="friend-grid">
                {p.friends_preview.map((f) => (
                  <Link key={f.id} to={`/profile/${f.username}`} className="friend-tile">
                    {f.avatar_url ? <img src={f.avatar_url} alt="" /> : <Avatar user={f} size={100} />}
                    <span>{fullName(f)}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div className="profile-main">
            {(self || p.can_post_on_wall) && <Composer wallUser={self ? null : p} onCreated={(x) => list.current?.prepend(x)} />}
            <div className="card pad"><h3>Posts</h3></div>
            <PostList endpoint={`/users/${p.id}/posts`} register={register} />
          </div>
        </div>
      ) : tab === 'about' ? (
        <div className="page-narrow"><About p={p} self={self} onEdit={() => setModal('edit')} /></div>
      ) : tab === 'friends' ? (
        <div className="page-narrow"><FriendsTab p={p} /></div>
      ) : (
        <div className="page-narrow"><PhotosTab p={p} /></div>
      )}

      {modal === 'edit' && <EditProfile onClose={() => setModal(null)} onSaved={(u) => { setUser(u); load(); setModal(null); }} />}
      {modal === 'block' && (
        <Confirm title={`Block ${fullName(p)}?`} danger confirmLabel="Block"
          text={`${p.first_name} won't be able to see your posts, tag you, message you, or add you as a friend. If you're friends, blocking will also unfriend them.`}
          onClose={() => setModal(null)}
          onConfirm={async () => { await api(`/friends/block/${p.id}`, { method: 'POST' }); toast(`${p.first_name} is blocked`); load(); }} />
      )}
    </div>
  );
}

export function FriendButton({ p, onChange }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const act = async (path, method = 'POST') => {
    try { const r = await api(path, { method }); onChange(r.relation); refresh(); } catch (e) { toast(e.message, 'error'); }
  };
  switch (p.relation) {
    case 'friends':
      return (
        <Menu align="left" trigger={<button className="btn btn-ghost"><Icon name="userCheck" size={18} /> Friends</button>} items={[
          { icon: 'userX', label: 'Unfriend', danger: true, onClick: () => act(`/friends/${p.id}`, 'DELETE') },
        ]} />
      );
    case 'request_sent':
      return <button className="btn btn-ghost" onClick={() => act(`/friends/request/${p.id}`, 'DELETE')}><Icon name="userX" size={18} /> Cancel request</button>;
    case 'request_received':
      return (
        <Menu align="left" trigger={<button className="btn btn-primary"><Icon name="userCheck" size={18} /> Respond</button>} items={[
          { label: 'Confirm', onClick: () => act(`/friends/accept/${p.id}`) },
          { label: 'Delete request', onClick: () => act(`/friends/decline/${p.id}`) },
        ]} />
      );
    default:
      return <button className="btn btn-primary" onClick={() => act(`/friends/request/${p.id}`)}><Icon name="userPlus" size={18} /> Add friend</button>;
  }
}

export function MessageButton({ userId, className = 'btn btn-ghost', label = 'Message' }) {
  const { openChatWithUser } = useChat();
  const toast = useToast();
  return (
    <button className={className} onClick={() => openChatWithUser(userId).catch((e) => toast(e.message, 'error'))}>
      <Icon name="chat" size={18} /> {label}
    </button>
  );
}

function Intro({ p, self, onEdit }) {
  const rows = aboutRows(p).slice(0, 5);
  return (
    <div className="card pad intro">
      <h3>Intro</h3>
      {p.bio && <p className="center">{p.bio}</p>}
      {self && <button className="btn btn-ghost btn-block" onClick={onEdit}>{p.bio ? 'Edit bio' : 'Add bio'}</button>}
      {rows.map(([icon, text]) => <div key={text} className="about-row"><Icon name={icon} className="muted" /> <span>{text}</span></div>)}
      {self && <button className="btn btn-ghost btn-block" onClick={onEdit}>Edit details</button>}
    </div>
  );
}

function aboutRows(p) {
  const rows = [];
  if (p.work) rows.push(['store', `Works at ${p.work}`]);
  if (p.education) rows.push(['bookmark', `Studied at ${p.education}`]);
  if (p.city) rows.push(['home', `Lives in ${p.city}`]);
  if (p.hometown) rows.push(['pin', `From ${p.hometown}`]);
  if (p.relationship) rows.push(['heart', p.relationship]);
  if (p.website) rows.push(['link', p.website]);
  rows.push(['history', `Joined ${new Date(p.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`]);
  return rows;
}

function About({ p, self, onEdit }) {
  const rows = aboutRows(p);
  return (
    <div className="card pad">
      <div className="row-between"><h3>About</h3>{self && <button className="btn btn-ghost btn-sm" onClick={onEdit}><Icon name="edit" size={16} /> Edit</button>}</div>
      {p.bio && <p>{p.bio}</p>}
      <h4 className="section-label">Overview</h4>
      {rows.map(([icon, text]) => <div key={text} className="about-row"><Icon name={icon} className="muted" /> <span>{text}</span></div>)}
      <h4 className="section-label">Basic info</h4>
      {p.gender && <div className="about-row"><Icon name="user" className="muted" /> <span>{p.gender[0].toUpperCase() + p.gender.slice(1)}<br /><span className="muted small">Gender</span></span></div>}
      {p.birthday && <div className="about-row"><Icon name="calendar" className="muted" /> <span>{new Date(`${p.birthday}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}<br /><span className="muted small">Birth date</span></span></div>}
    </div>
  );
}

function PhotosCard({ p }) {
  const [photos, setPhotos] = useState([]);
  const [viewer, setViewer] = useState(null);
  useEffect(() => { api(`/users/${p.id}/photos`).then((d) => setPhotos(d.photos)); }, [p.id, p.avatar_url, p.cover_url]);
  if (!photos.length) return null;
  return (
    <div className="card pad">
      <div className="row-between"><h3>Photos</h3><Link className="link-btn" to={`/profile/${p.username}/photos`}>See all photos</Link></div>
      <div className="photo-grid small">{photos.slice(0, 9).map((ph, i) => <button key={ph.id} onClick={() => setViewer(i)}><Media url={ph.url} controls={false} /></button>)}</div>
      {viewer !== null && <PhotoViewer media={photos} index={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

function PhotosTab({ p }) {
  const [photos, setPhotos] = useState(null);
  const [viewer, setViewer] = useState(null);
  useEffect(() => { api(`/users/${p.id}/photos`).then((d) => setPhotos(d.photos)); }, [p.id]);
  if (!photos) return <Spinner />;
  return (
    <div className="card pad">
      <h3>Photos</h3>
      {!photos.length && <p className="muted">No photos to show</p>}
      <div className="photo-grid">{photos.map((ph, i) => <button key={ph.id} onClick={() => setViewer(i)}><Media url={ph.url} controls={false} /></button>)}</div>
      {viewer !== null && <PhotoViewer media={photos} index={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

function FriendsTab({ p }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api(`/users/${p.id}/friends`).then(setData); }, [p.id]);
  if (!data) return <Spinner />;
  const list = data.friends.filter((f) => fullName(f).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card pad">
      <div className="row-between"><h3>Friends</h3>
        <div className="search-box inline"><Icon name="search" size={16} /><input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      {data.hidden && <p className="muted">{p.first_name}'s friend list is private.</p>}
      <div className="friends-list-grid">
        {list.map((f) => (
          <div key={f.id} className="friend-row card-inner">
            <Avatar user={f} size={80} link />
            <div className="grow">
              <Link to={`/profile/${f.username}`} className="strong">{fullName(f)}</Link>
              <div className="muted small">{f.mutual_count ? `${f.mutual_count} mutual friends` : f.city || f.work || ''}</div>
            </div>
            {f.is_my_friend && <span className="chip">Friends</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditProfile({ onClose, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const fields = ['first_name', 'last_name', 'bio', 'work', 'education', 'city', 'hometown', 'relationship', 'website', 'birthday', 'gender'];
  const [f, setF] = useState(Object.fromEntries(fields.map((k) => [k, user[k] || ''])));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    try { onSaved(await api('/users/me/profile', { method: 'PATCH', body: f })); toast('Profile updated', 'success'); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return (
    <Modal title="Edit profile" onClose={onClose} width={560} footer={<button className="btn btn-primary" disabled={busy} onClick={save}>Save</button>}>
      <div className="form-grid">
        <label className="field"><span>First name</span><input className="input" value={f.first_name} onChange={set('first_name')} /></label>
        <label className="field"><span>Last name</span><input className="input" value={f.last_name} onChange={set('last_name')} /></label>
        <label className="field span2"><span>Bio <span className="muted">({101 - f.bio.length} characters remaining)</span></span>
          <textarea className="input" maxLength={101} rows={2} value={f.bio} onChange={set('bio')} placeholder="Describe who you are" /></label>
        <label className="field"><span>Workplace</span><input className="input" value={f.work} onChange={set('work')} /></label>
        <label className="field"><span>Education</span><input className="input" value={f.education} onChange={set('education')} /></label>
        <label className="field"><span>Current city</span><input className="input" value={f.city} onChange={set('city')} /></label>
        <label className="field"><span>Hometown</span><input className="input" value={f.hometown} onChange={set('hometown')} /></label>
        <label className="field"><span>Relationship</span>
          <select className="input" value={f.relationship} onChange={set('relationship')}>
            {['', 'Single', 'In a relationship', 'Engaged', 'Married', "It's complicated", 'Divorced', 'Widowed'].map((r) => <option key={r} value={r}>{r || '—'}</option>)}
          </select></label>
        <label className="field"><span>Website</span><input className="input" value={f.website} onChange={set('website')} /></label>
        <label className="field"><span>Birthday</span><input className="input" type="date" value={f.birthday?.slice(0, 10) || ''} onChange={set('birthday')} /></label>
        <label className="field"><span>Gender</span>
          <select className="input" value={f.gender} onChange={set('gender')}>
            {['', 'female', 'male', 'custom'].map((g) => <option key={g} value={g}>{g || '—'}</option>)}
          </select></label>
      </div>
    </Modal>
  );
}
