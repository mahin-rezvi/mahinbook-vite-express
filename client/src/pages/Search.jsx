import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fullName } from '../lib/util.js';
import { Avatar, Spinner, Empty } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import PostCard from '../components/PostCard.jsx';
import { FriendButton, MessageButton } from './Profile.jsx';

const TYPES = [['all', 'All', 'grid'], ['posts', 'Posts', 'comment'], ['people', 'People', 'friends'], ['groups', 'Groups', 'groups'], ['pages', 'Pages', 'flag'], ['events', 'Events', 'calendar']];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const type = params.get('type') || 'all';
  const [res, setRes] = useState(null);
  useEffect(() => {
    setRes(null);
    api(`/search?q=${encodeURIComponent(q)}&type=${type}`).then(setRes);
  }, [q, type]);

  return (
    <div className="two-col">
      <aside className="sidebar left wide card-side">
        <h2 className="side-title">Search results</h2>
        <p className="muted small">for "{q}"</p>
        <h4 className="side-head">Filters</h4>
        {TYPES.map(([k, l, i]) => (
          <button key={k} className={`side-item ${type === k ? 'active' : ''}`} onClick={() => setParams({ q, type: k })}>
            <span className="side-icon round"><Icon name={i} /></span>{l}
          </button>
        ))}
      </aside>
      <section className="main-col feed">
        {!res && <Spinner />}
        {res && Object.values(res).every((v) => !v?.length) && <Empty icon="search" title="We didn't find any results" text="Make sure everything is spelled correctly or try different keywords." />}
        {!!res?.people?.length && (
          <div className="card pad">
            <h3>People</h3>
            {res.people.map((p) => (
              <div key={p.id} className="list-row">
                <Avatar user={p} size={60} link />
                <div className="grow">
                  <Link to={`/profile/${p.username}`} className="strong">{fullName(p)}</Link>
                  <div className="muted small">{[p.is_friend && 'Friend', p.mutual_count && `${p.mutual_count} mutual friends`, p.work, p.city && `Lives in ${p.city}`].filter(Boolean).join(' · ')}</div>
                </div>
                {p.is_friend ? <MessageButton userId={p.id} /> : <PersonAdd p={p} />}
              </div>
            ))}
            {type === 'all' && <button className="btn btn-ghost btn-block" onClick={() => setParams({ q, type: 'people' })}>See all</button>}
          </div>
        )}
        {!!res?.groups?.length && (
          <div className="card pad">
            <h3>Groups</h3>
            {res.groups.map((g) => (
              <Link key={g.id} to={`/groups/${g.id}`} className="list-row hover">
                <span className="group-thumb lg" style={g.cover_url ? { backgroundImage: `url(${g.cover_url})` } : undefined}>{!g.cover_url && g.name[0]}</span>
                <div className="grow"><b>{g.name}</b><div className="muted small">{g.privacy === 'private' ? 'Private' : 'Public'} · {g.member_count} members{g.my_status === 'member' ? ' · Joined' : ''}</div></div>
              </Link>
            ))}
          </div>
        )}
        {!!res?.pages?.length && (
          <div className="card pad">
            <h3>Pages</h3>
            {res.pages.map((p) => (
              <Link key={p.id} to={`/pages/${p.id}`} className="list-row hover">
                <Avatar user={{ id: p.id, first_name: p.name, last_name: '', avatar_url: p.avatar_url }} size={48} />
                <div className="grow"><b>{p.name}</b><div className="muted small">{p.category} · {p.follower_count} followers</div></div>
              </Link>
            ))}
          </div>
        )}
        {!!res?.events?.length && (
          <div className="card pad">
            <h3>Events</h3>
            {res.events.map((e) => (
              <Link key={e.id} to={`/events/${e.id}`} className="list-row hover">
                <span className="side-icon round"><Icon name="calendar" /></span>
                <div className="grow"><b>{e.title}</b><div className="muted small">{new Date(e.starts_at).toLocaleString()} · {e.location}</div></div>
              </Link>
            ))}
          </div>
        )}
        {!!res?.posts?.length && (
          <>
            <h3 className="muted">Posts</h3>
            {res.posts.map((p) => <PostCard key={p.id} post={p} />)}
          </>
        )}
      </section>
    </div>
  );
}

function PersonAdd({ p }) {
  const [rel, setRel] = useState('none');
  return <FriendButton p={{ ...p, relation: rel }} onChange={setRel} />;
}
