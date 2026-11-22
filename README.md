# MahinBook

A full-stack social network with a Facebook-style feature set, built with **Vite + React**, **Node.js (Express + WebSocket)** and **Neon Postgres**. It has its own name, logo and indigo look.

## Quick start

```bash
npm run install:all        # installs server + client deps
npm run migrate            # applies server/schema.sql to Neon
npm run seed               # demo users, posts, group, page, event, listings, chat
npm run dev                # API on :4000 + Vite on :5173
```

Open http://localhost:5173 and log in with **ayesha@demo.mahinbook / password123**. All the seeded demo accounts use `password123`, for example `tanvir@demo.mahinbook` and `nusrat@demo.mahinbook`. Use two browsers to try real-time chat.

The configuration lives in `server/.env` (see `server/.env.example`): `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CLIENT_ORIGIN`.

`npm run reset --prefix server -- --yes` **wipes every table** and re-seeds the demo data.

## Production

```bash
npm run build && npm start   # Express serves client/dist plus the API on one port
```

Uploaded photos and videos are stored on disk in `server/uploads/` when running the full-stack app.

## Cloudflare Pages

The free Cloudflare Pages build is a static public landing page at `https://mahinbook.pages.dev`. It avoids app API requests and does not show login or signup links that would lead nowhere. The full Express/Postgres app remains in this repository for a server deployment; account features, messaging, and uploads do not run on static hosting.

Create the Pages project once and deploy the static build:

```bash
npx wrangler pages project create mahinbook --production-branch main
npm run deploy:site
```

The static build includes landing page metadata, structured data, `robots.txt`, and `sitemap.xml`. Keep `server/.env` out of GitHub; it is ignored by `.gitignore`.

## Features

| Area | What's included |
|---|---|
| **Accounts** | Sign up (name, email, birthday, gender, 13+ check), log in by email or username, log out, sessions as httpOnly JWT cookies backed by a `sessions` table |
| **Profile** | Avatar and cover upload (each auto-posts an update), bio, work, education, city, hometown, relationship, website, birthday. Tabs: Posts, About, Friends, Photos. Friend faces, mutual friends, wall posts from friends |
| **Friends** | Send, cancel, accept and decline requests; unfriend; suggestions ranked by mutual friends; sent requests; all friends; birthdays; block and unblock |
| **News feed** | Friends, your own posts, joined groups, followed Pages and public posts. Infinite scroll, hide post, save post |
| **Posts** | Text, multi-photo/video (up to 10), colored backgrounds, feeling/activity, check-in, audience (Public / Friends / Only me), edit, change audience, delete, copy link, photo viewer |
| **Reactions** | Like, Love, Care, Haha, Wow, Sad, Angry (hover picker), a reactors list with tabs, "X and N others" |
| **Comments** | Threaded replies, image comments, comment reactions, edit and delete, sort by relevant / newest / all, emoji picker |
| **Sharing** | Share to feed (with audience), share to a group, send in Messenger, copy link; shared posts embed the original |
| **Stories** | Photo, video or text stories (24h expiry), viewer with progress bars and tap navigation, seen state, viewer list, delete |
| **Messenger** | Real-time 1:1 and group chats over WebSocket: typing indicators, read receipts ("Seen" avatars), online presence, images, replies, message reactions, edit (15 min), unsend, quick-emoji send, chat themes and emoji, nicknames, group name, add/remove members, leave, mute, archive, delete chat, shared media. Chat-head popups plus a full Messenger page, with a notification sound |
| **Notifications** | Real-time toasts and badges for requests, accepts, reactions, comments, replies, shares, wall posts, group and event activity. All/Unread, mark read/unread, remove, inline Confirm/Delete for friend requests |
| **Groups** | Public or private; join, or request to join with admin approval; invite friends; group feed; members; admins (promote, remove); settings; delete; "Your feed" across groups; discover |
| **Pages** | Create and edit Pages, post as a Page, follow/unfollow, Page posts in followers' feeds, message the owner |
| **Events** | Create (public or friends), Interested/Going RSVP, guests, invite friends, upcoming / your events / hosting / past |
| **Marketplace** | Listings with photo, price, category, condition and location; search; category and price filters; save; your listings; mark sold or pending; message the seller |
| **Search** | Typeahead with recent searches, and full results for people, posts, groups, Pages and events |
| **Video / Memories / Saved** | A video-only feed, posts from more than 30 days ago, and saved items |
| **Settings** | Personal details (name, username, email, phone, re-auth for sensitive changes); password change with "log out other devices"; active sessions with remote logout; privacy (default audience, who can post on your profile, who can send requests, friend-list visibility, email lookup, active status, read receipts); per-type notification toggles; blocking; dark mode (on / off / system); activity log; download your data (JSON); deactivate (reactivates on login); delete account |
| **UI** | Light and dark theme, responsive down to phone width, keyboard-friendly modals and menus |

### Not included

Live video streaming, voice and video calls, Reels, tagging people in posts, polls, hashtags, ads, Dating, Gaming, fundraisers, email verification and password-reset email, and 2FA. Each of these needs extra infrastructure such as WebRTC/TURN, a media pipeline or an email provider.

## Architecture

```
client/  Vite + React 18 + React Router
  src/context/   Auth, Socket (auto-reconnecting WS event bus), Chat (popup dock), Toast
  src/components/ Navbar, Sidebars, Composer, PostCard, Comments, Stories, MessageThread, ChatDock…
  src/pages/     Home, Profile, Friends, Messages, Groups, Pages, Events, Marketplace, Search, Settings…
server/  Express + ws + pg
  schema.sql     27 tables
  src/helpers.js post-visibility SQL (privacy, groups, blocks, deactivation), feed loader, notify()
  src/realtime.js WS auth via cookie, presence, typing, emit(userIds, event)
  src/routes/    auth, users, friends, posts (+comments), stories, messages, notifications,
                 groups, extras (pages/events/marketplace/search), settings
```

Privacy is enforced on the server. Every post read goes through `visibleTo()` in `server/src/helpers.js`, which checks the audience, friendship, group membership and privacy, blocks in both directions, and deactivated authors.
