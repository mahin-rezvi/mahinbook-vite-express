import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { fullName } from '../lib/util.js';
import { Avatar, Modal } from './ui.jsx';
import Icon from './Icon.jsx';

/** Pick people (typeahead) — used for new chats, group chats, invites. */
export function PeoplePicker({ selected, setSelected, friendsOnly = false, exclude = [] }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) {
        const d = await api('/friends');
        setResults(d.friends.slice(0, 12));
      } else {
        setResults((await api(`/search/typeahead?q=${encodeURIComponent(q)}${friendsOnly ? '&friends=1' : ''}`)).people);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, friendsOnly]);
  const toggle = (p) => setSelected((s) => (s.some((x) => x.id === p.id) ? s.filter((x) => x.id !== p.id) : [...s, p]));
  return (
    <div className="people-picker">
      <div className="chips-input">
        {selected.map((p) => (
          <span key={p.id} className="chip primary">{p.first_name}<button onClick={() => toggle(p)} aria-label="Remove"><Icon name="x" size={12} /></button></span>
        ))}
        <input autoFocus placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="list scroll">
        {results.filter((p) => !exclude.includes(p.id)).map((p) => (
          <label key={p.id} className="list-row hover">
            <Avatar user={p} size={36} />
            <span className="grow">{fullName(p)}</span>
            <input type="checkbox" checked={selected.some((x) => x.id === p.id)} onChange={() => toggle(p)} />
          </label>
        ))}
        {!results.length && <p className="muted center">No people found</p>}
      </div>
    </div>
  );
}

export default function NewMessage({ onClose, onOpen }) {
  const toast = useToast();
  const [selected, setSelected] = useState([]);
  const [title, setTitle] = useState('');
  async function start() {
    try {
      const c = await api('/conversations', { method: 'POST', body: { user_ids: selected.map((s) => s.id), title: selected.length > 1 ? title || undefined : undefined } });
      onOpen(c);
    } catch (e) { toast(e.message, 'error'); }
  }
  return (
    <Modal title="New message" onClose={onClose} width={460} footer={
      <button className="btn btn-primary" disabled={!selected.length} onClick={start}>{selected.length > 1 ? 'Create group' : 'Chat'}</button>
    }>
      <PeoplePicker selected={selected} setSelected={setSelected} />
      {selected.length > 1 && <input className="input mt" placeholder="Group name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />}
    </Modal>
  );
}
