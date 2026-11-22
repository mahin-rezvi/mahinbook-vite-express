import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { FEELINGS, POST_BACKGROUNDS, fullName, privacyLabel, EMOJI_PICKER } from '../lib/util.js';
import { Avatar, Modal, FilePicker, useObjectUrls, isVideo, Menu } from './ui.jsx';
import Icon from './Icon.jsx';

/** The "What's on your mind?" card. Opens the create-post dialog. */
export default function Composer({ onCreated, groupId, wallUser, page, placeholder }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(null); // null | 'text' | 'media' | 'feeling'
  const who = page ? { name: page.name, avatar_url: page.avatar_url, id: page.id } : user;
  const ph = placeholder || (wallUser ? `Write something to ${wallUser.first_name}...` : page ? `Create a post as ${page.name}` : `What's on your mind, ${user.first_name}?`);
  return (
    <div className="card composer">
      <div className="composer-top">
        <Avatar user={who} size={40} />
        <button className="composer-input" onClick={() => setOpen('text')}>{ph}</button>
      </div>
      <div className="composer-actions">
        <button onClick={() => setOpen('media')}><Icon name="video" className="c-red" /> Live video</button>
        <button onClick={() => setOpen('media')}><Icon name="photo" className="c-green" /> Photo/video</button>
        <button onClick={() => setOpen('feeling')}><Icon name="smile" className="c-yellow" /> Feeling/activity</button>
      </div>
      {open && (
        <CreatePostModal initial={open} onClose={() => setOpen(null)} groupId={groupId} wallUser={wallUser} page={page}
          onCreated={(p) => { setOpen(null); onCreated?.(p); }} />
      )}
    </div>
  );
}

export function CreatePostModal({ onClose, onCreated, groupId, wallUser, page, initial, edit }) {
  const { user } = useAuth();
  const toast = useToast();
  const [content, setContent] = useState(edit?.content || '');
  const [privacy, setPrivacy] = useState(edit?.privacy || user.settings.default_audience);
  const [files, setFiles] = useState([]);
  const [feeling, setFeeling] = useState(edit?.feeling || '');
  const [location, setLocation] = useState(edit?.location || '');
  const [bg, setBg] = useState(null);
  const [panel, setPanel] = useState(initial === 'feeling' ? 'feeling' : initial === 'media' ? 'media' : null);
  const [busy, setBusy] = useState(false);
  const urls = useObjectUrls(files);
  const canBg = !files.length && content.length < 130 && !edit;

  async function submit() {
    setBusy(true);
    try {
      let post;
      if (edit) {
        post = await api(`/posts/${edit.id}`, { method: 'PATCH', body: { content, privacy, feeling, location } });
      } else {
        post = await api('/posts', {
          method: 'POST',
          form: { content, privacy, feeling, location, bg: canBg ? bg : null, group_id: groupId, page_id: page?.id, wall_user_id: wallUser?.id, files },
        });
      }
      toast(edit ? 'Post updated' : 'Your post is now published', 'success');
      onCreated(post);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const who = page ? { name: page.name, avatar_url: page.avatar_url, id: page.id } : user;
  return (
    <Modal title={edit ? 'Edit post' : 'Create post'} onClose={onClose} width={520} className="create-post">
      <div className="cp-who">
        <Avatar user={who} size={42} />
        <div>
          <div className="strong">
            {page ? page.name : fullName(user)}
            {feeling && <span className="muted"> is {feeling.startsWith('at ') ? '' : 'feeling '}<b>{feeling}</b></span>}
            {location && <span className="muted"> at <b>{location}</b></span>}
          </div>
          {!groupId && !page && !wallUser && (
            <Menu align="left" trigger={<button className="chip"><Icon name={privacy === 'public' ? 'globe' : privacy === 'friends' ? 'friends' : 'lock'} size={14} /> {privacyLabel[privacy]} <Icon name="chevronDown" size={14} /></button>}
              items={['public', 'friends', 'only_me'].map((v) => ({
                icon: v === 'public' ? 'globe' : v === 'friends' ? 'friends' : 'lock', label: privacyLabel[v],
                hint: { public: 'Anyone on or off MahinBook', friends: 'Your friends on MahinBook', only_me: 'Only you' }[v],
                onClick: () => setPrivacy(v),
              }))} />
          )}
          {groupId && <span className="chip"><Icon name="groups" size={14} /> Group members</span>}
        </div>
      </div>

      <div className={`cp-text ${canBg && bg ? 'with-bg' : ''}`} style={canBg && bg ? { background: bg } : undefined}>
        <textarea autoFocus value={content} onChange={(e) => setContent(e.target.value)}
          placeholder={wallUser ? `Write something to ${wallUser.first_name}...` : `What's on your mind, ${page ? page.name : user.first_name}?`}
          rows={canBg && bg ? 3 : files.length ? 2 : 5} />
      </div>

      {canBg && (
        <div className="bg-picker">
          <button className={`bg-swatch none ${!bg ? 'sel' : ''}`} onClick={() => setBg(null)} aria-label="No background" />
          {POST_BACKGROUNDS.map((b) => (
            <button key={b} className={`bg-swatch ${bg === b ? 'sel' : ''}`} style={{ background: b }} onClick={() => setBg(b)} aria-label="Background" />
          ))}
          <Menu align="left" trigger={<button className="icon-btn" aria-label="Emoji"><Icon name="smile" /></button>}>
            <div className="emoji-grid">{EMOJI_PICKER.map((e) => <button key={e} onClick={() => setContent((c) => c + e)}>{e}</button>)}</div>
          </Menu>
        </div>
      )}

      {panel === 'media' && !edit && (
        <div className="cp-media">
          {urls.length ? (
            <div className={`media-grid n${Math.min(urls.length, 5)}`}>
              {urls.map((u, i) => (
                <div key={u} className="media-cell">
                  {isVideo(files[i]?.name) || files[i]?.type.startsWith('video') ? <video src={u} /> : <img src={u} alt="" />}
                  <button className="remove" onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
                </div>
              ))}
            </div>
          ) : (
            <FilePicker accept="image/*,video/*" multiple onFiles={(f) => setFiles((cur) => [...cur, ...f].slice(0, 10))} className="dropzone">
              <Icon name="photo" size={32} /><b>Add photos/videos</b><span className="muted">or drag and drop</span>
            </FilePicker>
          )}
          {!!urls.length && (
            <FilePicker accept="image/*,video/*" multiple onFiles={(f) => setFiles((cur) => [...cur, ...f].slice(0, 10))} className="btn btn-ghost btn-sm">
              <Icon name="plus" size={16} /> Add more
            </FilePicker>
          )}
        </div>
      )}

      {panel === 'feeling' && (
        <div className="cp-panel">
          <div className="cp-panel-head"><b>How are you feeling?</b><button className="link-btn" onClick={() => { setFeeling(''); setPanel(null); }}>Clear</button></div>
          <div className="feelings">
            {FEELINGS.map(([e, f]) => (
              <button key={f} className={`feeling ${feeling === `${e} ${f}` ? 'sel' : ''}`} onClick={() => { setFeeling(`${e} ${f}`); setPanel(null); }}>
                <span>{e}</span> {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {panel === 'location' && (
        <div className="cp-panel">
          <div className="cp-panel-head"><b>Check in</b></div>
          <input className="input" autoFocus placeholder="Where are you?" value={location} onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setPanel(null)} />
        </div>
      )}

      <div className="cp-add">
        <span>Add to your post</span>
        <div>
          {!edit && <button className={`icon-btn ${panel === 'media' ? 'on' : ''}`} title="Photo/video" onClick={() => setPanel(panel === 'media' ? null : 'media')}><Icon name="photo" className="c-green" /></button>}
          <button className={`icon-btn ${panel === 'feeling' ? 'on' : ''}`} title="Feeling/activity" onClick={() => setPanel(panel === 'feeling' ? null : 'feeling')}><Icon name="smile" className="c-yellow" /></button>
          <button className={`icon-btn ${panel === 'location' ? 'on' : ''}`} title="Check in" onClick={() => setPanel(panel === 'location' ? null : 'location')}><Icon name="pin" className="c-red" /></button>
        </div>
      </div>
      <button className="btn btn-primary btn-block" disabled={busy || (!content.trim() && !files.length)} onClick={submit}>
        {busy ? 'Posting…' : edit ? 'Save' : 'Post'}
      </button>
    </Modal>
  );
}
