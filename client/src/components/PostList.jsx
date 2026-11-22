import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import PostCard from './PostCard.jsx';
import { LoadMore, Empty, Spinner } from './ui.jsx';

/**
 * Paginated post list. `endpoint` returns { posts, next }.
 * Exposes `prepend` via ref-like `register` callback so a composer can add new posts on top.
 */
export default function PostList({ endpoint, register, empty }) {
  const [posts, setPosts] = useState(null);
  const [next, setNext] = useState(null);
  const loading = useRef(false);

  useEffect(() => {
    let cancel = false;
    setPosts(null);
    api(endpoint).then((d) => { if (!cancel) { setPosts(d.posts); setNext(d.next); } }).catch(() => !cancel && setPosts([]));
    return () => { cancel = true; };
  }, [endpoint]);

  useEffect(() => {
    register?.({ prepend: (p) => setPosts((l) => [p, ...(l || [])]) });
  }, [register]);

  const more = useCallback(async () => {
    if (!next || loading.current) return;
    loading.current = true;
    const sep = endpoint.includes('?') ? '&' : '?';
    const d = await api(`${endpoint}${sep}before=${encodeURIComponent(next)}`);
    setPosts((l) => [...l, ...d.posts.filter((p) => !l.some((x) => x.id === p.id))]);
    setNext(d.next);
    loading.current = false;
  }, [endpoint, next]);

  if (!posts) return <div className="center-pad"><Spinner /></div>;
  if (!posts.length) return empty || <Empty icon="comment" title="No posts yet" text="When there are posts, you'll see them here." />;
  return (
    <div className="post-list">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onDelete={(id) => setPosts((l) => l.filter((x) => x.id !== id))} />
      ))}
      <LoadMore onVisible={more} disabled={!next} />
      {!next && posts.length > 3 && <p className="muted center small">You're all caught up ✨</p>}
    </div>
  );
}
