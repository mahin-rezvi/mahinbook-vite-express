import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, Modal, Confirm, Spinner, Empty, FilePicker } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import Composer from '../components/Composer.jsx';
import PostList from '../components/PostList.jsx';
import { MessageButton } from './Profile.jsx';

const pageAvatar = (p) => ({ id: p.id, first_name: p.name, last_name: '', avatar_url: p.avatar_url });

export default function Pages() {
  const [data, setData] = useState(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { api('/pages').then(setData); }, []);
  if (!data) return <div className="center-pad"><Spinner /></div>;
  const Section = ({ title, list }) => !!list.length && (
    <div className="section">
      <h2>{title}</h2>
      <div className="person-grid">
        {list.map((p) => (
          <Link key={p.id} to={`/pages/${p.id}`} className="person-card card">
            <div className="person-img group-cover" style={p.cover_url ? { backgroundImage: `url(${p.cover_url})` } : undefined}><Avatar user={pageAvatar(p)} size={72} /></div>
            <div className="person-body"><b className="ellipsis">{p.name}</b><span className="muted small">{p.category} · {p.follower_count} followers</span></div>
          </Link>
        ))}
      </div>
    </div>
  );
  return (
    <div className="page-wide">
      <div className="row-between"><h1>Pages</h1><button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> Create new Page</button></div>
      <Section title="Your Pages" list={data.mine} />
      <Section title="Pages you follow" list={data.following} />
      <Section title="Discover Pages" list={data.discover} />
      {!data.mine.length && !data.following.length && !data.discover.length && <Empty icon="flag" title="No Pages yet" text="Create a Page for your business, brand or community." />}
      {creating && <CreatePage onClose={() => setCreating(false)} onCreated={(p) => navigate(`/pages/${p.id}`)} />}
    </div>
  );
}

function CreatePage({ onClose, onCreated, edit }) {
  const toast = useToast();
  const [f, setF] = useState({ name: edit?.name || '', category: edit?.category || '', description: edit?.description || '' });
  const [avatar, setAvatar] = useState(null);
  const [cover, setCover] = useState(null);
  async function save() {
    try {
      onCreated(await api(edit ? `/pages/${edit.id}` : '/pages', { method: edit ? 'PATCH' : 'POST', form: { ...f, avatar, cover } }));
    } catch (e) { toast(e.message, 'error'); }
  }
  return (
    <Modal title={edit ? 'Edit Page' : 'Create a Page'} onClose={onClose} width={500} footer={<button className="btn btn-primary" disabled={!f.name.trim()} onClick={save}>{edit ? 'Save' : 'Create Page'}</button>}>
      <div className="form-grid">
        <label className="field span2"><span>Page name (required)</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field span2"><span>Category</span><input className="input" placeholder="e.g. Café, Musician, Local business" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></label>
        <label className="field span2"><span>Bio</span><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <FilePicker onFiles={(x) => setAvatar(x[0])} className="btn btn-ghost"><Icon name="camera" size={18} /> {avatar ? avatar.name : 'Profile picture'}</FilePicker>
        <FilePicker onFiles={(x) => setCover(x[0])} className="btn btn-ghost"><Icon name="photo" size={18} /> {cover ? cover.name : 'Cover photo'}</FilePicker>
      </div>
    </Modal>
  );
}

export function PageDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [modal, setModal] = useState(null);
  const list = useRef();
  const register = useCallback((a) => { list.current = a; }, []);
  useEffect(() => { api(`/pages/${id}`).then(setP).catch(() => setP(false)); }, [id]);
  if (p === false) return <div className="page-narrow"><Empty icon="flag" title="Page not found" /></div>;
  if (!p) return <div className="center-pad"><Spinner /></div>;
  const owner = p.owner_id === user.id;
  const follow = async () => setP({ ...p, ...(await api(`/pages/${id}/follow`, { method: p.following ? 'DELETE' : 'POST' })), follower_count: p.follower_count + (p.following ? -1 : 1) });
  return (
    <div className="profile">
      <div className="profile-header">
        <div className="cover" style={p.cover_url ? { backgroundImage: `url(${p.cover_url})` } : undefined} />
        <div className="profile-bar">
          <div className="profile-avatar"><Avatar user={pageAvatar(p)} size={168} /></div>
          <div className="profile-id"><h1>{p.name}</h1><span className="muted strong">{p.follower_count} followers · {p.category}</span></div>
          <div className="profile-actions">
            {owner ? (
              <>
                <button className="btn btn-ghost" onClick={() => setModal('edit')}><Icon name="edit" size={18} /> Edit Page</button>
                <button className="btn btn-ghost" onClick={() => setModal('delete')}><Icon name="trash" size={18} /></button>
              </>
            ) : (
              <>
                <button className={`btn ${p.following ? 'btn-ghost' : 'btn-primary'}`} onClick={follow}><Icon name={p.following ? 'check' : 'like'} size={18} /> {p.following ? 'Following' : 'Follow'}</button>
                <MessageButton userId={p.owner_id} />
              </>
            )}
          </div>
        </div>
      </div>
      <div className="profile-body">
        <div className="profile-side">
          <div className="card pad"><h3>Intro</h3>{p.description && <p>{p.description}</p>}
            <div className="about-row"><Icon name="flag" className="muted" /> <span>Page · {p.category || 'Community'}</span></div>
            <div className="about-row"><Icon name="history" className="muted" /> <span>Created {new Date(p.created_at).toLocaleDateString()}</span></div></div>
        </div>
        <div className="profile-main">
          {owner && <Composer page={p} onCreated={(x) => list.current?.prepend(x)} />}
          <PostList endpoint={`/pages/${p.id}/posts`} register={register} />
        </div>
      </div>
      {modal === 'edit' && <CreatePage edit={p} onClose={() => setModal(null)} onCreated={(x) => { setP(x); setModal(null); }} />}
      {modal === 'delete' && <Confirm title="Delete Page?" danger confirmLabel="Delete" text="This permanently deletes the Page and its posts." onClose={() => setModal(null)}
        onConfirm={async () => { await api(`/pages/${id}`, { method: 'DELETE' }); navigate('/pages'); }} />}
    </div>
  );
}
