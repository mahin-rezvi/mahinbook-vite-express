import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { REACTIONS, timeAgo, EMOJI_PICKER } from '../lib/util.js';
import { Avatar, Menu, UserLink, FilePicker, useObjectUrls, Spinner } from './ui.jsx';
import Icon from './Icon.jsx';

export default function Comments({ post, inputRef, onCount }) {
  const [comments, setComments] = useState(null);
  const [sort, setSort] = useState('relevant');
  useEffect(() => { api(`/posts/${post.id}/comments`).then((d) => setComments(d.comments)); }, [post.id]);

  if (!comments) return <div className="comments"><Spinner /></div>;
  const top = comments.filter((c) => !c.parent_id);
  const sorted = sort === 'newest' ? [...top].reverse()
    : sort === 'relevant' ? [...top].sort((a, b) => b.like_count - a.like_count || new Date(a.created_at) - new Date(b.created_at)) : top;
  const replies = (id) => comments.filter((c) => c.parent_id === id);

  const add = (c) => { setComments((l) => [...l, c]); onCount(1); };
  const change = (c) => setComments((l) => l.map((x) => (x.id === c.id ? c : x)));
  const remove = (id) => {
    const n = 1 + comments.filter((c) => c.parent_id === id).length;
    setComments((l) => l.filter((x) => x.id !== id && x.parent_id !== id));
    onCount(-n);
  };

  return (
    <div className="comments">
      {top.length > 1 && (
        <div className="comment-sort">
          <Menu align="left" trigger={<button className="link-btn">{{ relevant: 'Most relevant', newest: 'Newest', all: 'All comments' }[sort]} <Icon name="chevronDown" size={14} /></button>}
            items={[
              { label: 'Most relevant', hint: 'Show comments with the most engagement first.', onClick: () => setSort('relevant') },
              { label: 'Newest', hint: 'Show all comments with the newest first.', onClick: () => setSort('newest') },
              { label: 'All comments', hint: 'Show all comments in order.', onClick: () => setSort('all') },
            ]} />
        </div>
      )}
      {sorted.map((c) => (
        <CommentItem key={c.id} c={c} post={post} replies={replies(c.id)} onAdd={add} onChange={change} onRemove={remove} />
      ))}
      <CommentInput postId={post.id} onAdd={add} inputRef={inputRef} />
    </div>
  );
}

function CommentItem({ c, post, replies, onAdd, onChange, onRemove, isReply }) {
  const { user } = useAuth();
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.content);
  const [showReplies, setShowReplies] = useState(replies.length <= 1);
  const mine = c.user.id === user.id;

  async function like(type = 'like') {
    const already = c.my_reaction === type;
    onChange(await api(`/comments/${c.id}/react`, already ? { method: 'DELETE' } : { method: 'POST', body: { type } }));
  }
  async function saveEdit() {
    onChange(await api(`/comments/${c.id}`, { method: 'PATCH', body: { content: text } }));
    setEditing(false);
  }

  return (
    <div className={`comment ${isReply ? 'reply' : ''}`}>
      <Avatar user={c.user} size={isReply ? 28 : 32} link />
      <div className="comment-main">
        {editing ? (
          <div className="comment-edit">
            <input className="input" value={text} autoFocus onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }} />
            <span className="muted small">Press Esc to cancel.</span>
          </div>
        ) : (
          <div className="comment-bubble-row">
            <div className="comment-bubble">
              <UserLink user={c.user} />
              {c.user.id === post.author.id && <span className="badge">Author</span>}
              {c.content && <div>{c.content}</div>}
              {c.like_count > 0 && (
                <span className="comment-likes">{REACTIONS[c.my_reaction || 'like'].emoji} {c.like_count}</span>
              )}
            </div>
            {(mine || post.author.id === user.id) && (
              <Menu trigger={<button className="icon-btn sm" aria-label="Comment options"><Icon name="dots" size={16} /></button>} items={[
                mine && { icon: 'edit', label: 'Edit', onClick: () => setEditing(true) },
                { icon: 'trash', label: 'Delete', danger: true, onClick: async () => { await api(`/comments/${c.id}`, { method: 'DELETE' }); onRemove(c.id); toast('Comment deleted'); } },
              ]} />
            )}
          </div>
        )}
        {c.image_url && <img className="comment-img" src={c.image_url} alt="" />}
        <div className="comment-actions">
          <span className="muted">{timeAgo(c.created_at, { short: true })}</span>
          <button onClick={() => like()} style={c.my_reaction ? { color: REACTIONS[c.my_reaction].color } : undefined}>
            {c.my_reaction ? REACTIONS[c.my_reaction].label : 'Like'}
          </button>
          <button onClick={() => setReplying(true)}>Reply</button>
          {c.updated_at && <span className="muted">Edited</span>}
        </div>
        {!isReply && replies.length > 0 && !showReplies && (
          <button className="link-btn view-replies" onClick={() => setShowReplies(true)}><Icon name="reply" size={14} /> View all {replies.length} replies</button>
        )}
        {showReplies && replies.map((r) => (
          <CommentItem key={r.id} c={r} post={post} replies={[]} onAdd={onAdd} onChange={onChange} onRemove={onRemove} isReply />
        ))}
        {replying && (
          <CommentInput postId={post.id} parentId={c.id} autoFocus prefix={isReply ? `${c.user.first_name} ` : ''}
            onAdd={(x) => { onAdd(x); setReplying(false); setShowReplies(true); }} />
        )}
      </div>
    </div>
  );
}

function CommentInput({ postId, parentId, onAdd, inputRef, autoFocus, prefix = '' }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState(prefix);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [url] = useObjectUrls(file ? [file] : []);

  async function submit() {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      onAdd(await api(`/posts/${postId}/comments`, { method: 'POST', form: { content: text, parent_id: parentId, image: file } }));
      setText('');
      setFile(null);
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className={`comment-input ${parentId ? 'reply' : ''}`}>
      <Avatar user={user} size={parentId ? 28 : 32} />
      <div className="ci-box">
        <textarea ref={inputRef} autoFocus={autoFocus} rows={1} value={text} disabled={busy}
          placeholder={parentId ? 'Write a reply…' : 'Write a comment…'}
          onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        <div className="ci-tools">
          <Menu align="right" trigger={<button className="icon-btn sm" aria-label="Emoji"><Icon name="smile" size={16} /></button>}>
            <div className="emoji-grid">{EMOJI_PICKER.map((e) => <button key={e} onClick={() => setText((t) => t + e)}>{e}</button>)}</div>
          </Menu>
          <FilePicker onFiles={(f) => setFile(f[0])} className="icon-btn sm"><Icon name="camera" size={16} /></FilePicker>
          <button className="icon-btn sm primary" disabled={busy || (!text.trim() && !file)} onClick={submit} aria-label="Send"><Icon name="send" size={16} /></button>
        </div>
        {url && (
          <div className="ci-preview"><img src={url} alt="" /><button className="remove" onClick={() => setFile(null)}><Icon name="x" size={14} /></button></div>
        )}
      </div>
    </div>
  );
}
