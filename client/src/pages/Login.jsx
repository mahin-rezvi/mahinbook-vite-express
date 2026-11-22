import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Modal } from '../components/ui.jsx';
import { Logo } from '../components/Navbar.jsx';

export default function Login() {
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [signup, setSignup] = useState(false);

  async function login(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { setUser(await api('/auth/login', { method: 'POST', body: { email, password } })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="login-brand"><Logo size={64} /><span>mahinbook</span></div>
        <p>Connect with friends and the world around you on MahinBook.</p>
      </div>
      <div className="login-box">
        <form className="card login-card" onSubmit={login}>
          <input className="input lg" type="text" placeholder="Email address or username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          <input className="input lg" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
          <div className="menu-divider" />
          <button type="button" className="btn btn-success btn-lg" onClick={() => setSignup(true)}>Create new account</button>
        </form>
        <p className="small center"><b>Create a Page</b> for a celebrity, brand or business.</p>
      </div>
      {signup && <Signup onClose={() => setSignup(false)} />}
    </div>
  );
}

function Signup({ onClose }) {
  const { setUser } = useAuth();
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', password: '', day: '1', month: '1', year: '2000', gender: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const years = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  async function submit(e) {
    e.preventDefault();
    const birthday = `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
    const age = (Date.now() - new Date(birthday)) / (365.25 * 24 * 3600 * 1000);
    if (age < 13) { setError('You must be at least 13 years old to sign up.'); return; }
    setBusy(true); setError('');
    try {
      setUser(await api('/auth/signup', { method: 'POST', body: { ...f, birthday } }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Sign up" onClose={onClose} width={440}>
      <p className="muted" style={{ marginTop: -8 }}>It's quick and easy.</p>
      <form className="signup" onSubmit={submit}>
        <div className="row2">
          <input className="input" placeholder="First name" value={f.first_name} onChange={set('first_name')} required />
          <input className="input" placeholder="Surname" value={f.last_name} onChange={set('last_name')} required />
        </div>
        <input className="input" type="email" placeholder="Email address" value={f.email} onChange={set('email')} required />
        <input className="input" type="password" placeholder="New password" value={f.password} onChange={set('password')} minLength={6} required />
        <label className="field-label">Date of birth</label>
        <div className="row3">
          <select className="input" value={f.day} onChange={set('day')}>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
          <select className="input" value={f.month} onChange={set('month')}>{months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          <select className="input" value={f.year} onChange={set('year')}>{years.map((y) => <option key={y}>{y}</option>)}</select>
        </div>
        <label className="field-label">Gender</label>
        <div className="row3">
          {['female', 'male', 'custom'].map((g) => (
            <label key={g} className="radio-box"><span>{g[0].toUpperCase() + g.slice(1)}</span>
              <input type="radio" name="gender" value={g} checked={f.gender === g} onChange={set('gender')} required /></label>
          ))}
        </div>
        <p className="tiny muted">By clicking Sign Up, you agree to our Terms, Privacy Policy and Cookies Policy.</p>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-success btn-lg center-block" disabled={busy}>{busy ? 'Creating…' : 'Sign Up'}</button>
      </form>
    </Modal>
  );
}
