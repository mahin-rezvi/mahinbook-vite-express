import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fullName, privacyLabel } from '../lib/util.js';
import { Avatar, Modal } from './ui.jsx';
import Icon from './Icon.jsx';

export default function ShareModal({ post, onClose, onShared }) {
  const { user } = useAuth();
  const toast = useToast();
  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState(user.settings.default_audience === 'only_me' ? 'friends' : user.settings.default_audience);
  const [busy, setBusy] = useState(false);
  const [convs, setConvs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sent, setSent] = useState({});
  const link = `${location.origin}/post/${post.shared_post_id || post.id}`;

  useEffect(() => {
    api('/conversations').then((d) => setConvs(d.conversations.slice(0, 8)));
    api('/groups').then((d) => setGroups(d.mine));
  }, []);

  async function share(group_id) {
    setBusy(true);
    try {
      await api(`/posts/${post.id}/share`, { method: 'POST', body: { content, privacy, group_id } });
      toast(group_id ? 'Shared to group' : 'Shared to your feed', 'success');
      onShared?.();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function sendTo(conv) {
    await api(`/conversations/${conv.id}/messages`, { method: 'POST', form: { content: `${content ? `${content}\n` : ''}${link}` } });
    setSent((s) => ({ ...s, [conv.id]: true }));
  }

  return (
    <Modal title="Share" onClose={onClose} width={520}>
      <div className="cp-who">
        <Avatar user={user} size={42} />
        <div>
          <div className="strong">{fullName(user)}</div>
          <select className="chip" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
            {['public', 'friends', 'only_me'].map((v) => <option key={v} value={v}>{privacyLabel[v]}</option>)}
          </select>
        </div>
      </div>
      <textarea className="share-text" placeholder="Say something about this..." value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
      <div className="row-end"><button className="btn btn-primary" disabled={busy} onClick={() => share()}>Share now</button></div>

      {!!convs.length && (
        <>
          <h4 className="section-label">Send in Messenger</h4>
          <div className="share-convs">
            {convs.map((c) => {
              const other = c.members.find((m) => m.id !== user.id);
              const name = c.title || (c.is_group ? c.members.filter((m) => m.id !== user.id).map((m) => m.first_name).join(', ') : fullName(other));
              return (
                <button key={c.id} className="share-conv" onClick={() => !sent[c.id] && sendTo(c)}>
                  <Avatar user={c.is_group ? { id: c.id, first_name: name, last_name: '', avatar_url: c.image_url } : other} size={52} />
                  <span className="ellipsis">{name}</span>
                  <span className={`chip ${sent[c.id] ? '' : 'primary'}`}>{sent[c.id] ? 'Sent' : 'Send'}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <h4 className="section-label">Share to</h4>
      <div className="share-targets">
        <button className="share-target" onClick={() => { navigator.clipboard?.writeText(link); toast('Link copied'); }}>
          <span className="round"><Icon name="link" /></span>Copy link
        </button>
        {groups.slice(0, 4).map((g) => (
          <button key={g.id} className="share-target" disabled={busy} onClick={() => share(g.id)}>
            <span className="round"><Icon name="groups" /></span><span className="ellipsis">{g.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
