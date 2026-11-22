import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { ChatProvider } from './context/ChatContext.jsx';
import Navbar from './components/Navbar.jsx';
import ChatDock from './components/ChatDock.jsx';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Profile from './pages/Profile.jsx';
import Friends from './pages/Friends.jsx';
import Messages from './pages/Messages.jsx';
import Notifications from './pages/Notifications.jsx';
import Groups, { GroupDetail } from './pages/Groups.jsx';
import Pages, { PageDetail } from './pages/Pages.jsx';
import Events, { EventDetail } from './pages/Events.jsx';
import Marketplace from './pages/Marketplace.jsx';
import Search from './pages/Search.jsx';
import Settings from './pages/Settings.jsx';
import { Saved, PostPage, Watch, Memories } from './pages/Misc.jsx';
import Landing from './pages/Landing.jsx';

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const isPublicLanding = location.pathname === '/';
    document.title = isPublicLanding
      ? 'MahinBook | Social Network for Friends & Communities'
      : 'MahinBook';

    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = isPublicLanding ? 'index, follow' : 'noindex, nofollow';

    const canonical = document.querySelector('link[rel="canonical"]');
    if (isPublicLanding && canonical) canonical.href = `${window.location.origin}/`;
    else canonical?.remove();
  }, [location.pathname]);

  if (loading) return <div className="boot"><Spinner size={40} /></div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <SocketProvider>
      <ChatProvider>
        <Navbar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/profile/:username/:tab?" element={<Profile />} />
            <Route path="/friends/:tab?" element={<Friends />} />
            <Route path="/messages/:id?" element={<Messages />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/groups/:id/:tab?" element={<GroupDetail />} />
            <Route path="/pages" element={<Pages />} />
            <Route path="/pages/:id" element={<PageDetail />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/marketplace/:id?" element={<Marketplace />} />
            <Route path="/search" element={<Search />} />
            <Route path="/settings/:section?" element={<Settings />} />
            <Route path="/saved" element={<Saved />} />
            <Route path="/watch" element={<Watch />} />
            <Route path="/memories" element={<Memories />} />
            <Route path="/post/:id" element={<PostPageKeyed />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <ChatDock />
      </ChatProvider>
    </SocketProvider>
  );
}

function PostPageKeyed() {
  const { id } = useParams();
  return <PostPage key={id} id={id} />;
}
