import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fullName, timeAgo, POST_BACKGROUNDS } from '../lib/util.js';
import { Avatar, Modal, FilePicker, useObjectUrls, Media } from './ui.jsx';
import Icon from './Icon.jsx';

export default function StoriesBar() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [viewing, setViewing] = useState(null); // index into users
  const [creating, setCreating] = useState(false);
  const scroller = useRef();
  const load = () => api('/stories').then((d) => setUsers(d.users));
  useEffect(() => { load(); }, []);

  return (
    <div className="stories-wrap">
      <div className="stories" ref={scroller}>
        <button className="story-card create" onClick={() => setCreating(true)}>
          <div className="story-create-img"><Avatar user={user} size={120} /></div>
          <div className="story-create-foot"><span className="plus-badge"><Icon name="plus" size={18} /></span>Create story</div>
        </button>
        {users.map((g, i) => {
          const last = g.stories.at(-1);
          return (
            <button key={g.user.id} className="story-card" onClick={() => setViewing(i)}
              style={last.bg && !last.media_url ? { background: last.bg } : undefined}>
              {last.media_url && <Media url={last.media_url} controls={false} className="story-bgimg" />}
              {!last.media_url && <span className="story-text-preview">{last.text}</span>}
              <span className={`story-avatar ${g.all_seen ? 'seen' : ''}`}><Avatar user={g.user} size={36} /></span>
              <span className="story-name">{g.user.id === user.id ? 'Your story' : fullName(g.user)}</span>
            </button>
          );
        })}
      </div>
      {users.length > 3 && (
        <button className="stories-next icon-btn" onClick={() => scroller.current.scrollBy({ left: 360, behavior: 'smooth' })} aria-label="More stories">
          <Icon name="chevronRight" />
        </button>
      )}
      {viewing !== null && <StoryViewer groups={users} start={viewing} onClose={() => { setViewing(null); load(); }} />}
      {creating && <CreateStory onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </div>
  );
}

const DURATION = 6000;

function StoryViewer({ groups, start, onClose }) {
  const { user } = useAuth();
  const [gi, setGi] = useState(start);
  const [si, setSi] = useState(() => Math.max(0, groups[start].stories.findIndex((s) => !s.seen)));
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [viewers, setViewers] = useState(null);
  const g = groups[gi];
  const story = g?.stories[si];

  useEffect(() => {
    if (!story) return;
    if (story.user_id !== user.id && !story.seen) api(`/stories/${story.id}/view`, { method: 'POST' }).catch(() => {});
    setProgress(0);
  }, [story?.id]);

  useEffect(() => {
    if (paused || !story) return;
    const t0 = Date.now() - progress * DURATION;
    const id = setInterval(() => {
      const p = (Date.now() - t0) / DURATION;
      if (p >= 1) { clearInterval(id); next(); } else setProgress(p);
    }, 50);
    return () => clearInterval(id);
  }, [paused, story?.id]);

  function next() {
    if (si < g.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) { setGi(gi + 1); setSi(0); }
    else onClose();
  }
  function prev() {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) { setGi(gi - 1); setSi(groups[gi - 1].stories.length - 1); }
  }
  if (!story) return null;
  const mine = story.user_id === user.id;

  return (
    <div className="story-viewer" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); }}
      tabIndex={-1} ref={(el) => el?.focus()}>
      <button className="pv-close icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      <div className="sv-stage" onMouseDown={() => setPaused(true)} onMouseUp={() => setPaused(false)}>
        <div className="sv-bars">
          {g.stories.map((s, i) => (
            <div key={s.id} className="sv-bar"><div style={{ width: `${i < si ? 100 : i === si ? progress * 100 : 0}%` }} /></div>
          ))}
        </div>
        <div className="sv-head">
          <Avatar user={g.user} size={36} />
          <b>{fullName(g.user)}</b><span>{timeAgo(story.created_at, { short: true })}</span>
          {mine && (
            <button className="icon-btn sm" title="Delete story" onClick={async (e) => {
              e.stopPropagation(); await api(`/stories/${story.id}`, { method: 'DELETE' }); onClose();
            }}><Icon name="trash" size={16} /></button>
          )}
        </div>
        <div className="sv-content" style={!story.media_url ? { background: story.bg || POST_BACKGROUNDS[0] } : undefined}>
          {story.media_url && <Media url={story.media_url} controls={false} />}
          {story.text && <div className={`sv-text ${story.media_url ? 'overlay' : ''}`}>{story.text}</div>}
        </div>
        <button className="sv-tap left" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Previous" />
        <button className="sv-tap right" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Next" />
        {mine && (
          <button className="sv-viewers" onClick={async (e) => {
            e.stopPropagation(); setPaused(true);
            setViewers((await api(`/stories/${story.id}/viewers`)).viewers);
          }}><Icon name="eye" size={16} /> {story.view_count || 0} viewer{story.view_count === 1 ? '' : 's'}</button>
        )}
      </div>
      {viewers && (
        <Modal title="Story viewers" onClose={() => { setViewers(null); setPaused(false); }} width={400}>
          {!viewers.length && <p className="muted">No viewers yet.</p>}
          {viewers.map((v) => (
            <div key={v.user.id} className="list-row"><Avatar user={v.user} size={36} /><b className="grow">{fullName(v.user)}</b>
              <span className="muted small">{timeAgo(v.viewed_at, { short: true })}</span></div>
          ))}
        </Modal>
      )}
    </div>
  );
}

function CreateStory({ onClose, onCreated }) {
  const toast = useToast();
  const [mode, setMode] = useState(null);
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [bg, setBg] = useState(POST_BACKGROUNDS[0]);
  const [privacy, setPrivacy] = useState('friends');
  const [url] = useObjectUrls(file ? [file] : []);

  async function share() {
    try {
      await api('/stories', { method: 'POST', form: { file, text, bg: file ? null : bg, privacy } });
      toast('Your story was shared', 'success');
      onCreated();
    } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <Modal title="Create story" onClose={onClose} width={560}>
      {!mode && (
        <div className="story-modes">
          <FilePicker accept="image/*,video/*" onFiles={(f) => { setFile(f[0]); setMode('photo'); }} className="story-mode photo">
            <span className="round"><Icon name="photo" /></span>Create a photo story
          </FilePicker>
          <button className="story-mode text" onClick={() => setMode('text')}><span className="round">Aa</span>Create a text story</button>
        </div>
      )}
      {mode && (
        <div className="story-editor">
          <div className="story-preview" style={mode === 'text' ? { background: bg } : undefined}>
            {url && (file?.type.startsWith('video') ? <video src={url} autoPlay muted loop /> : <img src={url} alt="" />)}
            <div className={`sv-text ${url ? 'overlay' : ''}`}>{text || (mode === 'text' ? 'Start typing' : '')}</div>
          </div>
          <div className="story-tools">
            <textarea className="input" rows={3} placeholder={mode === 'text' ? 'Start typing' : 'Add text (optional)'} value={text} onChange={(e) => setText(e.target.value)} />
            {mode === 'text' && (
              <div className="bg-picker">{POST_BACKGROUNDS.map((b) => <button key={b} className={`bg-swatch ${bg === b ? 'sel' : ''}`} style={{ background: b }} onClick={() => setBg(b)} />)}</div>
            )}
            <label className="field"><span>Story privacy</span>
              <select className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                <option value="friends">Friends</option><option value="public">Public</option>
              </select>
            </label>
            <div className="row-end">
              <button className="btn btn-ghost" onClick={() => { setMode(null); setFile(null); }}>Discard</button>
              <button className="btn btn-primary" disabled={mode === 'text' && !text.trim()} onClick={share}>Share to story</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
