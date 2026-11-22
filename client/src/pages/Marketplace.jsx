import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fullName, formatPrice, timeAgo, MARKET_CATEGORIES } from '../lib/util.js';
import { Avatar, Modal, Confirm, Spinner, Empty, FilePicker, useObjectUrls } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function Marketplace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ q: '', category: '', min: '', max: '', scope: '' });
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const load = () => api(`/marketplace${qs(filters)}`).then((d) => setList(d.listings));
  useEffect(() => { setList(null); load(); }, [filters]);
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="two-col">
      <aside className="sidebar left wide card-side">
        <h2 className="side-title">Marketplace</h2>
        <div className="search-box inline"><Icon name="search" size={16} />
          <input placeholder="Search Marketplace" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && set('q', q)} /></div>
        <button className={`side-item ${!filters.scope ? 'active' : ''}`} onClick={() => set('scope', '')}><span className="side-icon round"><Icon name="store" /></span>Browse all</button>
        <button className={`side-item ${filters.scope === 'mine' ? 'active' : ''}`} onClick={() => set('scope', 'mine')}><span className="side-icon round"><Icon name="tag" /></span>Your listings</button>
        <button className={`side-item ${filters.scope === 'saved' ? 'active' : ''}`} onClick={() => set('scope', 'saved')}><span className="side-icon round"><Icon name="bookmark" /></span>Saved</button>
        <button className="btn btn-primary-soft btn-block" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> Create new listing</button>
        <div className="side-divider" />
        <h4 className="side-head">Filters</h4>
        <div className="row2"><input className="input sm" placeholder="Min" type="number" value={filters.min} onChange={(e) => set('min', e.target.value)} />
          <input className="input sm" placeholder="Max" type="number" value={filters.max} onChange={(e) => set('max', e.target.value)} /></div>
        <h4 className="side-head">Categories</h4>
        <button className={`side-item ${!filters.category ? 'active' : ''}`} onClick={() => set('category', '')}>All categories</button>
        {MARKET_CATEGORIES.map((c) => <button key={c} className={`side-item ${filters.category === c ? 'active' : ''}`} onClick={() => set('category', c)}>{c}</button>)}
      </aside>
      <section className="main-col">
        <h2>{filters.scope === 'mine' ? 'Your listings' : filters.scope === 'saved' ? 'Saved items' : "Today's picks"}{filters.q && ` · "${filters.q}"`}</h2>
        {!list && <Spinner />}
        {list && !list.length && <Empty icon="store" title="No listings found" text="Try a different search or category." />}
        <div className="market-grid">
          {list?.map((l) => (
            <button key={l.id} className="market-item" onClick={() => navigate(`/marketplace/${l.id}`)}>
              <div className="market-img">{l.image_url ? <img src={l.image_url} alt="" loading="lazy" /> : <Icon name="store" size={40} />}
                {l.status !== 'available' && <span className="chip status">{l.status === 'sold' ? 'Sold' : 'Pending'}</span>}</div>
              <b>{formatPrice(l.price)}</b>
              <span className="ellipsis">{l.title}</span>
              <span className="muted small ellipsis">{l.location}</span>
            </button>
          ))}
        </div>
      </section>
      {creating && <CreateListing onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {id && <ListingModal id={id} onClose={() => navigate('/marketplace')} onChanged={load} />}
    </div>
  );
}

function CreateListing({ onClose, onCreated }) {
  const toast = useToast();
  const [f, setF] = useState({ title: '', price: '', category: 'Electronics', condition: 'Used - Good', location: '', description: '' });
  const [image, setImage] = useState(null);
  const [url] = useObjectUrls(image ? [image] : []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Item for sale" onClose={onClose} width={520} footer={
      <button className="btn btn-primary" disabled={!f.title} onClick={async () => {
        try { await api('/marketplace', { method: 'POST', form: { ...f, image } }); toast('Listing published', 'success'); onCreated(); }
        catch (e) { toast(e.message, 'error'); }
      }}>Publish</button>
    }>
      <div className="form-grid">
        <div className="field span2">{url && <img src={url} className="cover-preview" alt="" />}
          <FilePicker onFiles={(x) => setImage(x[0])} className="dropzone sm"><Icon name="photo" size={24} /> {image ? 'Change photo' : 'Add photo'}</FilePicker></div>
        <label className="field span2"><span>Title</span><input className="input" value={f.title} onChange={set('title')} /></label>
        <label className="field"><span>Price (৳)</span><input className="input" type="number" min="0" value={f.price} onChange={set('price')} /></label>
        <label className="field"><span>Category</span><select className="input" value={f.category} onChange={set('category')}>{MARKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field"><span>Condition</span><select className="input" value={f.condition} onChange={set('condition')}>{['New', 'Used - Like new', 'Used - Good', 'Used - Fair'].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field"><span>Location</span><input className="input" value={f.location} onChange={set('location')} /></label>
        <label className="field span2"><span>Description</span><textarea className="input" rows={3} value={f.description} onChange={set('description')} /></label>
      </div>
    </Modal>
  );
}

function ListingModal({ id, onClose, onChanged }) {
  const { user } = useAuth();
  const { openChatWithUser } = useChat();
  const toast = useToast();
  const [l, setL] = useState(null);
  const [msg, setMsg] = useState('Hi, is this still available?');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { api(`/marketplace/${id}`).then(setL).catch(() => onClose()); }, [id]);
  if (!l) return null;
  const mine = l.seller.id === user.id;
  async function message() {
    const c = await openChatWithUser(l.seller.id);
    await api(`/conversations/${c.id}/messages`, { method: 'POST', form: { content: `${msg}\n${location.origin}/marketplace/${l.id}` } });
    toast('Message sent to seller', 'success');
  }
  return (
    <Modal onClose={onClose} width={900} className="listing-modal">
      <div className="listing">
        <div className="listing-img">{l.image_url ? <img src={l.image_url} alt="" /> : <Icon name="store" size={64} />}</div>
        <div className="listing-info">
          <div className="row-between"><h2>{l.title}</h2><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
          <h3>{formatPrice(l.price)}</h3>
          <p className="muted small">Listed {timeAgo(l.created_at)}{l.location && ` in ${l.location}`}</p>
          <div className="btn-row">
            {!mine && <button className="btn btn-ghost" onClick={async () => { await api(`/marketplace/${l.id}/save`, { method: l.saved ? 'DELETE' : 'POST' }); setL({ ...l, saved: !l.saved }); onChanged(); }}>
              <Icon name="bookmark" size={18} fill={l.saved ? 'currentColor' : 'none'} /> {l.saved ? 'Saved' : 'Save'}</button>}
            <button className="btn btn-ghost" onClick={() => { navigator.clipboard?.writeText(location.href); toast('Link copied'); }}><Icon name="share" size={18} /> Share</button>
          </div>
          <h4 className="section-label">Details</h4>
          <div className="about-row"><span className="muted">Condition</span><b>{l.condition}</b></div>
          <div className="about-row"><span className="muted">Category</span><b>{l.category}</b></div>
          {l.description && <p>{l.description}</p>}
          <h4 className="section-label">Seller information</h4>
          <div className="list-row"><Avatar user={l.seller} size={40} link /><b>{fullName(l.seller)}</b></div>
          {mine ? (
            <div className="btn-row">
              <select className="input" value={l.status} onChange={async (e) => { setL(await api(`/marketplace/${l.id}`, { method: 'PATCH', body: { status: e.target.value } })); onChanged(); }}>
                <option value="available">Available</option><option value="pending">Pending</option><option value="sold">Sold</option>
              </select>
              <button className="btn btn-danger" onClick={() => setConfirm(true)}><Icon name="trash" size={18} /> Delete listing</button>
            </div>
          ) : (
            <div className="card-inner pad">
              <b><Icon name="chat" size={16} /> Send seller a message</b>
              <textarea className="input" rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} />
              <button className="btn btn-primary btn-block" onClick={message}>Send</button>
            </div>
          )}
        </div>
      </div>
      {confirm && <Confirm title="Delete listing?" danger confirmLabel="Delete" text="This listing will be removed from Marketplace." onClose={() => setConfirm(false)}
        onConfirm={async () => { await api(`/marketplace/${l.id}`, { method: 'DELETE' }); onChanged(); onClose(); }} />}
    </Modal>
  );
}
