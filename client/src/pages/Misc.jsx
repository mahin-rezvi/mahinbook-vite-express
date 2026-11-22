import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import PostCard from '../components/PostCard.jsx';
import PostList from '../components/PostList.jsx';
import { Spinner, Empty } from '../components/ui.jsx';

export function Saved() {
  const [posts, setPosts] = useState(null);
  useEffect(() => { api('/posts/saved').then((d) => setPosts(d.posts)); }, []);
  return (
    <div className="page-narrow feed">
      <h1>Saved items</h1>
      {!posts && <Spinner />}
      {posts && !posts.length && <Empty icon="bookmark" title="Nothing saved yet" text="Save posts you want to see again. Only you can see what you save." />}
      {posts?.map((p) => <PostCard key={p.id} post={p} onUpdate={(x) => !x.saved && setPosts((l) => l.filter((y) => y.id !== x.id))} />)}
    </div>
  );
}

export function PostPage({ id }) {
  const [post, setPost] = useState(undefined);
  useEffect(() => { api(`/posts/${id}`).then(setPost).catch(() => setPost(null)); }, [id]);
  if (post === undefined) return <div className="center-pad"><Spinner /></div>;
  if (!post) return <div className="page-narrow"><Empty icon="block" title="This content isn't available right now" text="It may have been deleted, or shared with a small group that doesn't include you."><Link className="btn btn-primary" to="/">Go to News Feed</Link></Empty></div>;
  return <div className="page-narrow feed"><PostCard post={post} defaultComments onDelete={() => setPost(null)} /></div>;
}

export function Watch() {
  return (
    <div className="page-narrow feed">
      <h1>Video</h1>
      <PostList endpoint="/posts/videos" empty={<Empty icon="video" title="No videos yet" text="Videos posted by your friends, groups and Pages will show up here." />} />
    </div>
  );
}

export function Memories() {
  return (
    <div className="page-narrow feed">
      <h1>Memories</h1>
      <p className="muted">A look back at things you shared more than a month ago.</p>
      <PostList endpoint="/posts/memories" empty={<Empty icon="history" title="No memories to look back on today" text="Keep posting — your memories will appear here over time." />} />
    </div>
  );
}
