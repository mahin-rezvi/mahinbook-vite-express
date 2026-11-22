import { useCallback, useRef } from 'react';
import { LeftSidebar, RightSidebar } from '../components/Sidebars.jsx';
import StoriesBar from '../components/Stories.jsx';
import Composer from '../components/Composer.jsx';
import PostList from '../components/PostList.jsx';
import { Empty } from '../components/ui.jsx';
import { Link } from 'react-router-dom';

export default function Home() {
  const list = useRef();
  const register = useCallback((api) => { list.current = api; }, []);
  return (
    <div className="three-col">
      <LeftSidebar />
      <section className="feed">
        <StoriesBar />
        <Composer onCreated={(p) => list.current?.prepend(p)} />
        <PostList endpoint="/posts/feed" register={register} empty={
          <Empty icon="friends" title="Welcome to MahinBook" text="Add friends and join groups to fill your feed.">
            <Link to="/friends/suggestions" className="btn btn-primary">Find friends</Link>
          </Empty>
        } />
      </section>
      <RightSidebar />
    </div>
  );
}
