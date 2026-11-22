import { useState } from 'react';
import { NotificationList } from '../components/Navbar.jsx';
import { Tabs } from '../components/ui.jsx';

export default function Notifications() {
  const [tab, setTab] = useState('all');
  return (
    <div className="page-narrow">
      <div className="card pad">
        <h1>Notifications</h1>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} />
        <NotificationList unreadOnly={tab === 'unread'} />
      </div>
    </div>
  );
}
