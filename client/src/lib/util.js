export const fullName = (u) => (u ? `${u.first_name} ${u.last_name}` : '');

export function timeAgo(date, { short = false } = {}) {
  const d = new Date(date);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return short ? 'now' : 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return short ? `${m}m` : `${m} minute${m > 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return short ? `${h}h` : `${h} hour${h > 1 ? 's' : ''} ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return short ? `${days}d` : days === 1 ? 'Yesterday' : `${days} days ago`;
  if (short) return `${Math.floor(days / 7)}w`;
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

export function activeLabel(u) {
  if (!u) return '';
  if (u.online) return 'Active now';
  if (!u.last_active) return '';
  return `Active ${timeAgo(u.last_active, { short: true })} ago`.replace('now ago', 'now');
}

export const REACTIONS = {
  like: { emoji: '👍', label: 'Like', color: '#2f6bff' },
  love: { emoji: '❤️', label: 'Love', color: '#f33e58' },
  care: { emoji: '🥰', label: 'Care', color: '#f7b125' },
  haha: { emoji: '😆', label: 'Haha', color: '#f7b125' },
  wow: { emoji: '😮', label: 'Wow', color: '#f7b125' },
  sad: { emoji: '😢', label: 'Sad', color: '#f7b125' },
  angry: { emoji: '😡', label: 'Angry', color: '#e9710f' },
};

export const FEELINGS = [
  ['😊', 'happy'], ['😍', 'loved'], ['😎', 'cool'], ['🥳', 'excited'], ['😌', 'relaxed'], ['🤩', 'amazing'],
  ['😴', 'tired'], ['😢', 'sad'], ['😤', 'annoyed'], ['🙏', 'thankful'], ['💪', 'motivated'], ['🤒', 'sick'],
  ['😇', 'blessed'], ['🤔', 'thoughtful'], ['😂', 'funny'], ['❤️', 'in love'],
];

export const POST_BACKGROUNDS = [
  'linear-gradient(135deg,#5b4bff,#a855f7)', 'linear-gradient(135deg,#f6d365,#fda085)',
  'linear-gradient(135deg,#43e97b,#38f9d7)', 'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#30cfd0,#330867)', 'linear-gradient(135deg,#ff0844,#ffb199)',
  '#111827', '#e11d48',
];

export const CHAT_COLORS = ['#5b4bff', '#0a7cff', '#e11d48', '#16a34a', '#f59e0b', '#9333ea', '#0891b2', '#111827'];
export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '🎉'];
export const EMOJI_PICKER = '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 🥵 🥶 😱 😨 🤗 🤔 🤭 🤫 😶 😐 😬 🙄 😴 🤤 😷 🤒 👍 👎 👏 🙌 🙏 💪 👋 ✌️ 🤞 👌 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 🔥 ✨ 🎉 🎂 🎁 ☕ 🍕 🌹 🌅 ⚽ 🏆 📷 ✈️'.split(' ');

export const MARKET_CATEGORIES = ['Electronics', 'Vehicles', 'Property', 'Furniture', 'Clothing', 'Home & Garden', 'Hobbies', 'Toys & Games', 'Sports', 'Other'];

export const privacyLabel = { public: 'Public', friends: 'Friends', only_me: 'Only me' };

export function formatPrice(n) {
  if (!n) return 'Free';
  return `৳${Number(n).toLocaleString()}`;
}

export function notificationText(n) {
  const r = n.data?.reaction;
  switch (n.type) {
    case 'friend_request': return 'sent you a friend request.';
    case 'friend_accept': return 'accepted your friend request.';
    case 'reaction': return `reacted ${r ? REACTIONS[r]?.emoji : ''} to your post.`;
    case 'comment': return `commented on your post${n.data?.snippet ? `: "${n.data.snippet}"` : '.'}`;
    case 'reply': return `replied to your comment${n.data?.snippet ? `: "${n.data.snippet}"` : '.'}`;
    case 'comment_like': return 'liked your comment.';
    case 'share': return 'shared your post.';
    case 'wall_post': return 'posted on your timeline.';
    case 'group_join_request': return `asked to join ${n.group_name}.`;
    case 'group_approved': return `approved your request to join ${n.group_name}.`;
    case 'group_invite': return `invited you to join ${n.group_name}.`;
    case 'group_post': return `posted in ${n.group_name}.`;
    case 'event_invite': return 'invited you to an event.';
    case 'page_follow': return 'started following your Page.';
    default: return 'interacted with you.';
  }
}

export function notificationLink(n) {
  if (n.post_id) return `/post/${n.post_id}`;
  if (n.group_id) return `/groups/${n.group_id}`;
  if (n.data?.event_id) return `/events/${n.data.event_id}`;
  if (n.data?.page_id) return `/pages/${n.data.page_id}`;
  if (n.type === 'friend_request') return '/friends/requests';
  return `/profile/${n.actor?.username}`;
}

export function deviceLabel(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return `${browser} on ${os}`;
}
