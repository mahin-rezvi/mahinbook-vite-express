import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { fullName } from '../lib/util.js';

const AVATAR_COLORS = ['#5b4bff', '#e11d48', '#0891b2', '#16a34a', '#f59e0b', '#9333ea', '#db2777', '#0d9488'];

export function Avatar({ user, size = 40, online, ring, link = false, className = '' }) {
  const name = fullName(user) || user?.name || '?';
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const color = AVATAR_COLORS[(user?.id || 0) % AVATAR_COLORS.length];
  const img = user?.avatar_url;
  const el = (
    <span className={`avatar ${ring ? 'avatar-ring' : ''} ${className}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {img ? <img src={img} alt={name} /> : <span className="avatar-fallback" style={{ background: color }}>{initials}</span>}
      {online && <span className="online-dot" style={{ width: Math.max(10, size / 4), height: Math.max(10, size / 4) }} />}
    </span>
  );
  return link && user?.username ? <Link to={`/profile/${user.username}`} className="avatar-link">{el}</Link> : el;
}

export function UserLink({ user, className = '' }) {
  if (!user) return null;
  return <Link to={`/profile/${user.username}`} className={`user-link ${className}`}>{fullName(user)}</Link>;
}

export function Modal({ title, onClose, children, width = 500, footer, className = '' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open'); };
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal card ${className}`} style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Dropdown triggered by a button. `items` = [{ icon, label, onClick, danger, hint }] or a render prop. */
export function Menu({ trigger, items, align = 'right', className = '', children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className={`menu-wrap ${className}`} ref={ref}>
      <span onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>{trigger}</span>
      {open && (
        <div className={`menu card menu-${align}`} onClick={() => setOpen(false)}>
          {children}
          {items?.filter(Boolean).map((it, i) => it.divider ? <div key={i} className="menu-divider" /> : (
            <button key={i} className={`menu-item ${it.danger ? 'danger' : ''}`} onClick={it.onClick}>
              {it.icon && <Icon name={it.icon} />}
              <span>
                <span className="menu-label">{it.label}</span>
                {it.hint && <span className="menu-hint">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Spinner({ size = 24 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

export function Empty({ icon = 'info', title, text, children }) {
  return (
    <div className="empty card">
      <Icon name={icon} size={40} />
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {children}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value}
          className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}{t.count ? <span className="tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      {label && <span>{label}</span>}
    </label>
  );
}

export function Confirm({ title, text, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} width={440} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>
          {confirmLabel}
        </button>
      </>
    }>
      <p>{text}</p>
    </Modal>
  );
}

export function FilePicker({ accept = 'image/*', multiple, onFiles, children, className = '' }) {
  const ref = useRef();
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current.click()}>{children}</button>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} />
    </>
  );
}

/** Infinite-scroll sentinel */
export function LoadMore({ onVisible, disabled }) {
  const ref = useRef();
  useEffect(() => {
    if (disabled) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && onVisible(), { rootMargin: '600px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [onVisible, disabled]);
  return <div ref={ref} className="load-more">{!disabled && <Spinner />}</div>;
}

export function useObjectUrls(files) {
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach(URL.revokeObjectURL);
  }, [files]);
  return urls;
}

export const isVideo = (url = '') => /\.(mp4|webm|mov|ogg)$/i.test(url);

export function Media({ url, className = '', controls = true, onClick }) {
  return isVideo(url)
    ? <video src={url} className={className} controls={controls} onClick={onClick} />
    : <img src={url} className={className} alt="" loading="lazy" onClick={onClick} />;
}
