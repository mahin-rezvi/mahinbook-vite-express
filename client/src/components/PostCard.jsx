import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { REACTIONS, fullName, timeAgo, privacyLabel } from '../lib/util.js';
import { Avatar, Menu, Modal, Confirm, Media, Tabs, UserLink } from './ui.jsx';
import Icon from './Icon.jsx';
import Comments from './Comments.jsx';
import ShareModal from './ShareModal.jsx';
import { CreatePostModal } from './Composer.jsx';

export default function PostCard({ post: initial, onDelete, onUpdate, embedded = false, defaultComments = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const [post, setPost] = useState(initial);
  const [showComments, setShowComments] = useState(defaultComments);
  const [modal, setModal] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [viewer, setViewer] = useState(null);
  const commentRef = useRef();

  const update = (p) => { setPost(p); onUpdate?.(p); };
  const mine = post.author.id === user.id;
  const canDelete = mine || post.wall_user?.id === user.id;

  if (post.unavailable) {
    return <div className="card shared-unavailable"><b>This content isn't available right now</b><p className="muted">It may have been deleted or its audience changed.</p></div>;
  }
  if (hidden) {
    return (
      <div className="card post hidden-post">
        <div><b>Hidden</b><p className="muted">Hiding posts helps us personalize your feed.</p></div>
        <button className="btn btn-ghost" onClick={async () => { await api(`/posts/${post.id}/hide`, { method: 'DELETE' }); setHidden(false); }}>Undo</button>
      </div>
    );
  }

  async function react(type) {
    const already = post.my_reaction === type;
    // optimistic
    const counts = { ...post.reaction_counts };
    if (post.my_reaction) counts[post.my_reaction] = Math.max(0, (counts[post.my_reaction] || 1) - 1);
    if (!already) counts[type] = (counts[type] || 0) + 1;
    setPost({ ...post, my_reaction: already ? null : type, reaction_counts: counts });
    try {
      update(await api(`/posts/${post.id}/react`, already ? { method: 'DELETE' } : { method: 'POST', body: { type } }));
    } catch (e) { toast(e.message, 'error'); setPost(post); }
  }

  async function toggleSave() {
    await api(`/posts/${post.id}/save`, { method: post.saved ? 'DELETE' : 'POST' });
    update({ ...post, saved: !post.saved });
    toast(post.saved ? 'Removed from saved items' : 'Saved to your items', 'success');
  }

  async function changeAudience(privacy) {
    update(await api(`/posts/${post.id}`, { method: 'PATCH', body: { privacy } }));
  }

  const totalReactions = Object.values(post.reaction_counts || {}).reduce((a, b) => a + b, 0);
  const topTypes = Object.entries(post.reaction_counts || {}).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
  const reactorNames = (post.top_reactors || []).map((u) => (u.id === user.id ? 'You' : fullName(u)));
  const reactionSummary = totalReactions === 0 ? '' : post.my_reaction && totalReactions === 1 ? 'You'
    : reactorNames.length && totalReactions > reactorNames.length ? `${reactorNames[0]} and ${totalReactions - 1} other${totalReactions - 1 > 1 ? 's' : ''}`
    : reactorNames.join(', ') || totalReactions;

  const isProfileUpdate = post.feeling === 'updated their profile picture' || post.feeling === 'updated their cover photo';
  const textOnlyBg = post.bg && !post.media.length && !post.shared_post_id;
  const author = post.page ? { ...post.page, first_name: post.page.name, last_name: '' } : post.author;

  return (
    <article className={`card post ${embedded ? 'embedded' : ''}`}>
      <header className="post-head">
        {post.page
          ? <Link to={`/pages/${post.page.id}`}><Avatar user={author} size={40} /></Link>
          : <Avatar user={post.author} size={40} link />}
        <div className="post-meta">
          <div className="post-title">
            {post.page ? <Link to={`/pages/${post.page.id}`} className="user-link">{post.page.name}</Link> : <UserLink user={post.author} />}
            {post.wall_user && <> <Icon name="chevronRight" size={14} /> <UserLink user={post.wall_user} /></>}
            {post.group && !embedded && <> <Icon name="chevronRight" size={14} /> <Link to={`/groups/${post.group.id}`} className="user-link">{post.group.name}</Link></>}
            {post.feeling && <span className="muted"> {isProfileUpdate ? post.feeling : <>is feeling <b>{post.feeling}</b></>}</span>}
            {post.location && <span className="muted"> at <b>{post.location}</b></span>}
            {post.shared_post_id && !post.feeling && <span className="muted"> shared a post</span>}
          </div>
          <div className="post-sub muted">
            <Link to={`/post/${post.id}`} title={new Date(post.created_at).toLocaleString()}>{timeAgo(post.created_at)}</Link>
            {post.updated_at && <span> · Edited</span>}
            <span> · </span>
            <Icon name={post.group ? 'groups' : post.privacy === 'public' ? 'globe' : post.privacy === 'friends' ? 'friends' : 'lock'} size={12}
              title={post.group ? 'Group' : privacyLabel[post.privacy]} />
          </div>
        </div>
        {!embedded && (
          <Menu trigger={<button className="icon-btn" aria-label="Post options"><Icon name="dots" /></button>} items={[
            { icon: 'bookmark', label: post.saved ? 'Unsave post' : 'Save post', hint: 'Add this to your saved items.', onClick: toggleSave },
            { icon: 'link', label: 'Copy link', onClick: () => { navigator.clipboard?.writeText(`${location.origin}/post/${post.id}`); toast('Link copied'); } },
            { divider: true },
            mine && { icon: 'edit', label: 'Edit post', onClick: () => setModal('edit') },
            mine && !post.group && !post.page && { icon: 'globe', label: 'Edit audience', onClick: () => setModal('audience') },
            canDelete && { icon: 'trash', label: 'Move to trash', danger: true, onClick: () => setModal('delete') },
            !mine && { icon: 'eyeOff', label: 'Hide post', hint: 'See fewer posts like this.', onClick: async () => { await api(`/posts/${post.id}/hide`, { method: 'POST' }); setHidden(true); } },
          ]} />
        )}
      </header>

      {post.content && (
        textOnlyBg
          ? <div className="post-bg" style={{ background: post.bg }}>{post.content}</div>
          : <div className={`post-text ${post.content.length < 85 && !post.media.length && !post.shared_post_id ? 'big' : ''}`}>{post.content}</div>
      )}

      {!!post.media.length && (
        <div className={`media-grid n${Math.min(post.media.length, 5)} ${isProfileUpdate && post.feeling.includes('profile') ? 'profile-pic-post' : ''}`}>
          {post.media.slice(0, 5).map((m, i) => (
            <div key={m.id} className="media-cell" onClick={() => setViewer(i)}>
              <Media url={m.url} controls={post.media.length === 1} />
              {i === 4 && post.media.length > 5 && <div className="more-overlay">+{post.media.length - 5}</div>}
            </div>
          ))}
        </div>
      )}

      {post.shared_post && (
        <div className="shared-wrap"><PostCard post={post.shared_post} embedded /></div>
      )}

      {!embedded && (
        <>
          <div className="post-stats">
            <button className="reaction-summary" onClick={() => totalReactions && setModal('reactions')}>
              {topTypes.map((t) => <span key={t} className="reaction-bubble">{REACTIONS[t].emoji}</span>)}
              <span className="muted">{reactionSummary}</span>
            </button>
            <div className="muted stat-links">
              {post.comment_count > 0 && <button onClick={() => setShowComments((s) => !s)}>{post.comment_count} comment{post.comment_count > 1 ? 's' : ''}</button>}
              {post.share_count > 0 && <span>{post.share_count} share{post.share_count > 1 ? 's' : ''}</span>}
            </div>
          </div>
          <div className="post-actions">
            <ReactionButton current={post.my_reaction} onReact={react} />
            <button className="action" onClick={() => { setShowComments(true); setTimeout(() => commentRef.current?.focus(), 50); }}>
              <Icon name="comment" /> Comment
            </button>
            <button className="action" onClick={() => setModal('share')}><Icon name="share" /> Share</button>
          </div>
          {showComments && (
            <Comments post={post} inputRef={commentRef}
              onCount={(delta) => setPost((p) => ({ ...p, comment_count: p.comment_count + delta }))} />
          )}
        </>
      )}

      {modal === 'reactions' && <ReactionsModal postId={post.id} counts={post.reaction_counts} onClose={() => setModal(null)} />}
      {modal === 'share' && <ShareModal post={post} onClose={() => setModal(null)} onShared={() => update({ ...post, share_count: post.share_count + 1 })} />}
      {modal === 'edit' && <CreatePostModal edit={post} onClose={() => setModal(null)} onCreated={(p) => { update(p); setModal(null); }} />}
      {modal === 'delete' && (
        <Confirm title="Move to your trash?" danger confirmLabel="Delete"
          text="This post will be permanently deleted. You can't undo this."
          onClose={() => setModal(null)}
          onConfirm={async () => { await api(`/posts/${post.id}`, { method: 'DELETE' }); onDelete?.(post.id); toast('Post deleted'); }} />
      )}
      {modal === 'audience' && (
        <Modal title="Select audience" onClose={() => setModal(null)} width={420}>
          <p className="muted">Who can see this post?</p>
          {['public', 'friends', 'only_me'].map((v) => (
            <label key={v} className="radio-row">
              <Icon name={v === 'public' ? 'globe' : v === 'friends' ? 'friends' : 'lock'} />
              <span className="grow">{privacyLabel[v]}</span>
              <input type="radio" checked={post.privacy === v} onChange={() => { changeAudience(v); setModal(null); }} />
            </label>
          ))}
        </Modal>
      )}
      {viewer !== null && <PhotoViewer media={post.media} index={viewer} post={post} onClose={() => setViewer(null)} />}
    </article>
  );
}

export function ReactionButton({ current, onReact, compact }) {
  const [open, setOpen] = useState(false);
  const timer = useRef();
  const enter = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 450); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 300); };
  const r = current ? REACTIONS[current] : null;
  return (
    <div className="reaction-wrap" onMouseEnter={enter} onMouseLeave={leave}>
      {open && (
        <div className="reaction-picker card" onMouseEnter={() => clearTimeout(timer.current)}>
          {Object.entries(REACTIONS).map(([k, v]) => (
            <button key={k} title={v.label} onClick={() => { setOpen(false); onReact(k); }}>{v.emoji}</button>
          ))}
        </div>
      )}
      <button className={`action ${compact ? 'compact' : ''}`} style={r ? { color: r.color, fontWeight: 600 } : undefined}
        onClick={() => onReact(current || 'like')} onContextMenu={(e) => { e.preventDefault(); setOpen(true); }}>
        {r && current !== 'like' ? <span className="react-emoji">{r.emoji}</span> : !compact && <Icon name="like" fill={current === 'like' ? 'currentColor' : 'none'} />}
        {r ? r.label : 'Like'}
      </button>
    </div>
  );
}

function ReactionsModal({ postId, counts, onClose }) {
  const [list, setList] = useState(null);
  const [tab, setTab] = useState('all');
  useEffect(() => { api(`/posts/${postId}/reactions`).then((d) => setList(d.reactions)); }, [postId]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const shown = (list || []).filter((r) => tab === 'all' || r.type === tab);
  return (
    <Modal title="Reactions" onClose={onClose} width={480}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: `All ${total}` },
        ...Object.entries(counts).filter(([, c]) => c).map(([t, c]) => ({ value: t, label: `${REACTIONS[t].emoji} ${c}` }))]} />
      <div className="list">
        {shown.map((r) => (
          <div key={r.user.id} className="list-row">
            <span className="avatar-badge"><Avatar user={r.user} size={40} link /><span>{REACTIONS[r.type].emoji}</span></span>
            <UserLink user={r.user} className="grow" />
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function PhotoViewer({ media, index, post, onClose }) {
  const [i, setI] = useState(index);
  const go = (d) => setI((x) => (x + d + media.length) % media.length);
  return (
    <div className="photo-viewer" onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); if (e.key === 'Escape') onClose(); }} tabIndex={-1} ref={(el) => el?.focus()}>
      <button className="pv-close icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      {media.length > 1 && <button className="pv-nav left icon-btn" onClick={() => go(-1)}><Icon name="chevronLeft" size={28} /></button>}
      <div className="pv-stage"><Media url={media[i].url} /></div>
      {media.length > 1 && <button className="pv-nav right icon-btn" onClick={() => go(1)}><Icon name="chevronRight" size={28} /></button>}
      {post?.content && <div className="pv-caption"><b>{fullName(post.author)}</b> {post.content}</div>}
    </div>
  );
}
