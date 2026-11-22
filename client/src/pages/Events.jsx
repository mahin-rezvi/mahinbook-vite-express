import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fullName } from '../lib/util.js';
import { Avatar, Modal, Confirm, Spinner, Empty, FilePicker, Menu } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { PeoplePicker } from '../components/NewMessage.jsx';

const fmt = (d) => new Date(d).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Events() {
  const [scope, setScope] = useState('upcoming');
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { setList(null); api(`/events?scope=${scope}`).then((d) => setList(d.events)); }, [scope]);
  return (
    <div className="two-col">
      <aside className="sidebar left wide card-side">
        <h2 className="side-title">Events</h2>
        {[['upcoming', 'Home', 'calendar'], ['going', 'Your events', 'userCheck'], ['hosting', 'Hosting', 'flag'], ['past', 'Past events', 'history']].map(([k, l, i]) => (
          <button key={k} className={`side-item ${scope === k ? 'active' : ''}`} onClick={() => setScope(k)}><span className="side-icon round"><Icon name={i} /></span>{l}</button>
        ))}
        <button className="btn btn-primary-soft btn-block" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> Create new event</button>
      </aside>
      <section className="main-col">
        <div className="section">
          <h2>{{ upcoming: 'Discover events', going: 'Your events', hosting: 'Hosting', past: 'Past events' }[scope]}</h2>
          {!list && <Spinner />}
          {list && !list.length && <Empty icon="calendar" title="No events" text="Create an event to bring people together." />}
          <div className="person-grid">{list?.map((e) => <EventCard key={e.id} e={e} />)}</div>
        </div>
      </section>
      {creating && <CreateEvent onClose={() => setCreating(false)} onCreated={(e) => navigate(`/events/${e.id}`)} />}
    </div>
  );
}

function EventCard({ e: initial }) {
  const [e, setE] = useState(initial);
  return (
    <div className="person-card card">
      <Link to={`/events/${e.id}`} className="person-img group-cover" style={e.cover_url ? { backgroundImage: `url(${e.cover_url})` } : undefined}>{!e.cover_url && <Icon name="calendar" size={48} />}</Link>
      <div className="person-body">
        <span className="small strong danger-text">{fmt(e.starts_at)}</span>
        <Link to={`/events/${e.id}`} className="strong ellipsis">{e.title}</Link>
        <span className="muted small ellipsis">{e.location}</span>
        <span className="muted small">{e.interested_count} interested · {e.going_count} going</span>
        <RsvpButton e={e} onChange={setE} />
      </div>
    </div>
  );
}

function RsvpButton({ e, onChange }) {
  const set = async (status) => onChange(await api(`/events/${e.id}/rsvp`, { method: 'POST', body: { status } }));
  return (
    <Menu align="left" trigger={<button className={`btn btn-block ${e.my_status ? 'btn-primary' : 'btn-ghost'}`}>
      <Icon name={e.my_status === 'going' ? 'check' : 'like'} size={16} /> {e.my_status === 'going' ? 'Going' : e.my_status === 'interested' ? 'Interested' : 'Interested'} <Icon name="chevronDown" size={14} /></button>}
      items={[
        { icon: 'like', label: 'Interested', onClick: () => set('interested') },
        { icon: 'check', label: 'Going', onClick: () => set('going') },
        e.my_status && { icon: 'x', label: 'Not interested', onClick: () => set(null) },
      ]} />
  );
}

function CreateEvent({ onClose, onCreated }) {
  const toast = useToast();
  const [f, setF] = useState({ title: '', starts_at: '', location: '', description: '', privacy: 'public' });
  const [cover, setCover] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Create event" onClose={onClose} width={520} footer={
      <button className="btn btn-primary" disabled={!f.title || !f.starts_at} onClick={async () => {
        try { onCreated(await api('/events', { method: 'POST', form: { ...f, starts_at: new Date(f.starts_at).toISOString(), cover } })); }
        catch (e) { toast(e.message, 'error'); }
      }}>Create event</button>
    }>
      <div className="form-grid">
        <label className="field span2"><span>Event name</span><input className="input" value={f.title} onChange={set('title')} autoFocus /></label>
        <label className="field"><span>Start date & time</span><input className="input" type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></label>
        <label className="field"><span>Privacy</span><select className="input" value={f.privacy} onChange={set('privacy')}><option value="public">Public</option><option value="friends">Friends</option></select></label>
        <label className="field span2"><span>Location</span><input className="input" value={f.location} onChange={set('location')} /></label>
        <label className="field span2"><span>What are the details?</span><textarea className="input" rows={3} value={f.description} onChange={set('description')} /></label>
        <FilePicker onFiles={(x) => setCover(x[0])} className="btn btn-ghost"><Icon name="photo" size={18} /> {cover ? cover.name : 'Add cover photo'}</FilePicker>
      </div>
    </Modal>
  );
}

export function EventDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [e, setE] = useState(null);
  const [modal, setModal] = useState(null);
  const load = () => api(`/events/${id}`).then(setE).catch(() => setE(false));
  useEffect(() => { load(); }, [id]);
  if (e === false) return <div className="page-narrow"><Empty icon="calendar" title="Event not found" /></div>;
  if (!e) return <div className="center-pad"><Spinner /></div>;
  const host = e.host.id === user.id;
  return (
    <div className="page-narrow">
      <div className="card event-detail">
        <div className="cover group" style={e.cover_url ? { backgroundImage: `url(${e.cover_url})` } : undefined} />
        <div className="pad">
          <span className="strong danger-text">{fmt(e.starts_at)}</span>
          <h1>{e.title}</h1>
          <p className="muted">{e.location}</p>
          <div className="btn-row">
            <div style={{ width: 180 }}><RsvpButton e={e} onChange={(x) => { setE({ ...e, ...x }); load(); }} /></div>
            <button className="btn btn-ghost" onClick={() => setModal('invite')}><Icon name="userPlus" size={18} /> Invite</button>
            {host && <button className="btn btn-ghost" onClick={() => setModal('delete')}><Icon name="trash" size={18} /> Delete</button>}
          </div>
        </div>
      </div>
      <div className="card pad">
        <h3>Details</h3>
        <div className="about-row"><Icon name="friends" className="muted" /><span>{e.going_count} people going · {e.interested_count} interested</span></div>
        <div className="about-row"><Avatar user={e.host} size={24} /><span>Event by <b>{fullName(e.host)}</b></span></div>
        <div className="about-row"><Icon name={e.privacy === 'public' ? 'globe' : 'friends'} className="muted" /><span>{e.privacy === 'public' ? 'Public · Anyone on or off MahinBook' : "Friends of the host"}</span></div>
        {e.description && <p>{e.description}</p>}
      </div>
      <div className="card pad">
        <h3>Guests</h3>
        {e.guests.map((g) => <div key={g.user.id} className="list-row"><Avatar user={g.user} size={36} link /><span className="grow">{fullName(g.user)}</span><span className="chip">{g.status === 'going' ? 'Going' : 'Interested'}</span></div>)}
      </div>
      {modal === 'invite' && <InviteEvent id={e.id} onClose={() => setModal(null)} onSent={() => toast('Invites sent', 'success')} />}
      {modal === 'delete' && <Confirm title="Delete event?" danger confirmLabel="Delete" text="Guests will no longer see this event." onClose={() => setModal(null)}
        onConfirm={async () => { await api(`/events/${e.id}`, { method: 'DELETE' }); navigate('/events'); }} />}
    </div>
  );
}

function InviteEvent({ id, onClose, onSent }) {
  const [sel, setSel] = useState([]);
  return (
    <Modal title="Invite friends" onClose={onClose} width={460} footer={
      <button className="btn btn-primary" disabled={!sel.length} onClick={async () => { await api(`/events/${id}/invite`, { method: 'POST', body: { user_ids: sel.map((s) => s.id) } }); onSent(); onClose(); }}>Send invitations</button>
    }>
      <PeoplePicker selected={sel} setSelected={setSel} friendsOnly />
    </Modal>
  );
}
