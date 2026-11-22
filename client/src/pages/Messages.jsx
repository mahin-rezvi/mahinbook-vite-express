import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fullName, CHAT_COLORS, QUICK_EMOJIS } from '../lib/util.js';
import { Avatar, Modal, Confirm, Spinner, Toggle, Tabs } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import MessageThread, { ConvAvatar, convName } from '../components/MessageThread.jsx';
import { ConversationRow } from '../components/Navbar.jsx';
import NewMessage, { PeoplePicker } from '../components/NewMessage.jsx';

export default function Messages() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [convs, setConvs] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [composing, setComposing] = useState(false);
  const [info, setInfo] = useState(true);
  const [current, setCurrent] = useState(null);

  const load = () => api(`/conversations${filter === 'archived' ? '?archived=1' : ''}`).then((d) => setConvs(d.conversations));
  useEffect(() => { load(); }, [filter]);
  useSocketEvent('message', load);
  useSocketEvent('read_self', load);
  useSocketEvent('conversation', load);
  useEffect(() => {
    if (!id && convs?.length && filter === 'all' && window.innerWidth > 900) navigate(`/messages/${convs[0].id}`, { replace: true });
  }, [id, convs]);

  const shown = (convs || [])
    .filter((c) => convName(c, user.id).toLowerCase().includes(q.toLowerCase()))
    .filter((c) => filter !== 'unread' || c.unread > 0)
    .filter((c) => filter !== 'groups' || c.is_group);

  return (
    <div className={`messenger ${id ? 'has-thread' : ''}`}>
      <aside className="m-list">
        <div className="drop-head">
          <h1>Chats</h1>
          <button className="round-btn" title="New message" onClick={() => setComposing(true)}><Icon name="edit" /></button>
        </div>
        <div className="search-box inline"><Icon name="search" size={16} /><input placeholder="Search Messenger" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="pill-row">
          {['all', 'unread', 'groups', 'archived'].map((f) => (
            <button key={f} className={`pill ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        <div className="m-scroll">
          {!convs && <Spinner />}
          {convs && !shown.length && <p className="muted pad center">{filter === 'archived' ? 'No archived chats' : 'No conversations'}</p>}
          {shown.map((c) => <ConversationRow key={c.id} c={c} me={user.id} active={Number(id) === c.id} onClick={() => navigate(`/messages/${c.id}`)} />)}
        </div>
      </aside>
      <section className="m-thread">
        {id ? (
          <MessageThread key={id} conversationId={Number(id)} onConversation={setCurrent}
            headerExtra={
              <div className="thread-head-actions">
                <button className="icon-btn chat-c mobile-only" onClick={() => navigate('/messages')} title="Back"><Icon name="back" /></button>
                <button className={`icon-btn chat-c ${info ? 'on' : ''}`} onClick={() => setInfo(!info)} title="Conversation information"><Icon name="info" /></button>
              </div>
            } />
        ) : (
          <div className="center-pad muted"><Icon name="chat" size={48} /><p>Select a chat or start a new conversation</p></div>
        )}
      </section>
      {id && info && current && <ChatInfo conv={current} onChange={setCurrent} onLeft={() => { load(); navigate('/messages'); }} />}
      {composing && <NewMessage onClose={() => setComposing(false)} onOpen={(c) => { setComposing(false); load(); navigate(`/messages/${c.id}`); }} />}
    </div>
  );
}

function ChatInfo({ conv, onChange, onLeft }) {
  const { user } = useAuth();
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const [section, setSection] = useState(null);
  const [media, setMedia] = useState([]);
  const others = conv.members.filter((m) => m.id !== user.id);
  const other = others[0];
  const patch = async (body) => onChange(await api(`/conversations/${conv.id}`, { method: 'PATCH', body }));

  useEffect(() => { if (section === 'media') api(`/conversations/${conv.id}/media`).then((d) => setMedia(d.media)); }, [section, conv.id]);

  return (
    <aside className="m-info">
      <div className="m-info-head">
        <ConvAvatar c={conv} me={user.id} size={80} />
        <h3>{convName(conv, user.id)}</h3>
        {!conv.is_group && other && <span className="muted small">{other.online ? 'Active now' : ''}</span>}
        <div className="m-info-actions">
          {!conv.is_group && other && (
            <Link to={`/profile/${other.username}`} className="info-act"><span className="round"><Icon name="user" /></span>Profile</Link>
          )}
          <button className="info-act" onClick={() => patch({ muted: !conv.muted })}><span className="round"><Icon name={conv.muted ? 'bell' : 'mute'} /></span>{conv.muted ? 'Unmute' : 'Mute'}</button>
          <button className="info-act" onClick={() => setSection(section === 'media' ? null : 'media')}><span className="round"><Icon name="photo" /></span>Media</button>
        </div>
      </div>

      <Accordion title="Customize chat" open={section === 'custom'} onToggle={() => setSection(section === 'custom' ? null : 'custom')}>
        {conv.is_group && <button className="menu-item" onClick={() => setModal('name')}><Icon name="edit" /> Change chat name</button>}
        <button className="menu-item" onClick={() => setModal('theme')}><span className="theme-dot" style={{ background: conv.color }} /> Change theme</button>
        <button className="menu-item" onClick={() => setModal('emoji')}><span>{conv.emoji}</span> Change emoji</button>
        <button className="menu-item" onClick={() => setModal('nick')}><Icon name="tag" /> Edit nicknames</button>
      </Accordion>

      {conv.is_group && (
        <Accordion title={`Chat members (${conv.members.length})`} open={section === 'members'} onToggle={() => setSection(section === 'members' ? null : 'members')}>
          {conv.members.map((m) => (
            <div key={m.id} className="list-row">
              <Avatar user={m} size={36} online={m.online} />
              <span className="grow">{fullName(m)}{m.id === conv.created_by && <span className="muted small"> · Group creator</span>}</span>
              {conv.created_by === user.id && m.id !== user.id && (
                <button className="icon-btn sm" title="Remove member" onClick={async () => { await api(`/conversations/${conv.id}/members/${m.id}`, { method: 'DELETE' }); onChange(await api(`/conversations/${conv.id}`)); }}><Icon name="x" size={14} /></button>
              )}
            </div>
          ))}
          <button className="menu-item" onClick={() => setModal('add')}><Icon name="userPlus" /> Add people</button>
        </Accordion>
      )}

      {section === 'media' && (
        <div className="m-media">{media.map((m) => <a key={m.id} href={m.image_url} target="_blank" rel="noreferrer"><img src={m.image_url} alt="" /></a>)}
          {!media.length && <p className="muted small pad">No photos shared yet</p>}</div>
      )}

      <Accordion title="Privacy & support" open={section === 'privacy'} onToggle={() => setSection(section === 'privacy' ? null : 'privacy')}>
        <div className="menu-item"><Icon name="mute" /> <span className="grow">Mute notifications</span><Toggle checked={conv.muted} onChange={(v) => patch({ muted: v })} /></div>
        <button className="menu-item" onClick={async () => { await patch({ archived: !conv.archived }); toast(conv.archived ? 'Chat unarchived' : 'Chat archived'); onLeft(); }}><Icon name="archive" /> {conv.archived ? 'Unarchive chat' : 'Archive chat'}</button>
        {!conv.is_group && other && <button className="menu-item danger" onClick={() => setModal('block')}><Icon name="block" /> Block</button>}
        {conv.is_group && <button className="menu-item danger" onClick={() => setModal('leave')}><Icon name="logout" /> Leave group</button>}
        <button className="menu-item danger" onClick={() => setModal('delete')}><Icon name="trash" /> Delete chat</button>
      </Accordion>

      {modal === 'theme' && (
        <Modal title="Themes" onClose={() => setModal(null)} width={380}>
          <div className="swatch-grid">{CHAT_COLORS.map((c) => <button key={c} className={`theme-swatch ${conv.color === c ? 'sel' : ''}`} style={{ background: c }} onClick={() => { patch({ color: c }); setModal(null); }} />)}</div>
        </Modal>
      )}
      {modal === 'emoji' && (
        <Modal title="Emoji" onClose={() => setModal(null)} width={380}>
          <div className="swatch-grid">{[...QUICK_EMOJIS, '🙏', '💯', '⚽', '☕'].map((e) => <button key={e} className="emoji-swatch" onClick={() => { patch({ emoji: e }); setModal(null); }}>{e}</button>)}</div>
        </Modal>
      )}
      {modal === 'name' && <TextPrompt title="Change chat name" initial={conv.title || ''} onClose={() => setModal(null)} onSave={(title) => patch({ title })} />}
      {modal === 'nick' && (
        <Modal title="Nicknames" onClose={() => setModal(null)} width={420}>
          {conv.members.map((m) => <NicknameRow key={m.id} m={m} onSave={(nickname) => patch({ nickname_for: m.id, nickname })} />)}
        </Modal>
      )}
      {modal === 'add' && <AddPeople conv={conv} onClose={() => setModal(null)} onDone={onChange} />}
      {modal === 'leave' && <Confirm title="Leave group chat?" danger confirmLabel="Leave group" text="You will stop receiving messages from this conversation." onClose={() => setModal(null)}
        onConfirm={async () => { await api(`/conversations/${conv.id}/members/me`, { method: 'DELETE' }); onLeft(); }} />}
      {modal === 'delete' && <Confirm title="Delete chat?" danger confirmLabel="Delete chat" text="This removes the chat from your inbox. Other people in the chat can still see it." onClose={() => setModal(null)}
        onConfirm={async () => { await api(`/conversations/${conv.id}`, { method: 'DELETE' }); onLeft(); }} />}
      {modal === 'block' && <Confirm title={`Block ${other.first_name}?`} danger confirmLabel="Block" text="They won't be able to message you, see your posts or add you as a friend." onClose={() => setModal(null)}
        onConfirm={async () => { await api(`/friends/block/${other.id}`, { method: 'POST' }); toast(`${other.first_name} blocked`); }} />}
    </aside>
  );
}

function Accordion({ title, open, onToggle, children }) {
  return (
    <div className="accordion">
      <button className="acc-head" onClick={onToggle}><b>{title}</b><Icon name="chevronDown" style={{ transform: open ? 'rotate(180deg)' : undefined }} /></button>
      {open && <div className="acc-body">{children}</div>}
    </div>
  );
}

function TextPrompt({ title, initial, onSave, onClose }) {
  const [v, setV] = useState(initial);
  return (
    <Modal title={title} onClose={onClose} width={420} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onSave(v); onClose(); }}>Save</button></>}>
      <input className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} />
    </Modal>
  );
}

function NicknameRow({ m, onSave }) {
  const [v, setV] = useState(m.nickname || '');
  return (
    <div className="list-row">
      <Avatar user={m} size={36} />
      <input className="input grow" placeholder={fullName(m)} value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn btn-ghost btn-sm" onClick={() => onSave(v)}>Set</button>
    </div>
  );
}

function AddPeople({ conv, onClose, onDone }) {
  const [sel, setSel] = useState([]);
  return (
    <Modal title="Add people" onClose={onClose} width={460} footer={
      <button className="btn btn-primary" disabled={!sel.length} onClick={async () => {
        onDone(await api(`/conversations/${conv.id}/members`, { method: 'POST', body: { user_ids: sel.map((s) => s.id) } })); onClose();
      }}>Add people</button>
    }>
      <PeoplePicker selected={sel} setSelected={setSel} exclude={conv.members.map((m) => m.id)} />
    </Modal>
  );
}
