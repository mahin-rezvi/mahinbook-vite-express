function BrandMark({ size = 40 }) {
  return <span className="logo" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-label="MahinBook">mb</span>;
}

const features = [
  {
    title: 'Keep up with your people',
    text: 'Share photos, videos, and everyday updates. React and comment to keep conversations moving.',
    mark: '01',
  },
  {
    title: 'Find your communities',
    text: 'Join groups around shared interests, follow Pages, and discover events with friends.',
    mark: '02',
  },
  {
    title: 'Chat in real time',
    text: 'Send direct messages, start group conversations, and share photos in Messenger.',
    mark: '03',
  },
];

export default function Landing() {
  const staticLanding = import.meta.env.VITE_STATIC_LANDING_ONLY === 'true';

  return (
    <div className="public-site">
      <header className="public-nav">
        <a className="public-brand" href="/" aria-label="MahinBook home">
          <BrandMark size={42} /><span>mahinbook</span>
        </a>
        <nav className="public-nav-actions" aria-label="Main navigation">
          <a className="public-nav-link" href="#features">Explore features</a>
          {!staticLanding && <a className="public-nav-link" href="/login">Log in</a>}
          {staticLanding
            ? <a className="btn btn-primary public-nav-cta" href="#features">Explore MahinBook</a>
            : <a className="btn btn-primary public-nav-cta" href="/login">Join MahinBook</a>}
        </nav>
      </header>

      <main>
        <section className="public-hero" aria-labelledby="public-title">
          <div className="public-hero-copy">
            <p className="public-eyebrow"><span /> A place for your people</p>
            <h1 id="public-title">Connect with friends and <span>communities.</span></h1>
            <p className="public-lede">
              MahinBook brings friends and communities together. Share what is happening,
              find groups around your interests, and stay close through messages and events.
            </p>
            <div className="public-hero-actions">
              {staticLanding
                ? <a className="btn btn-primary public-main-cta" href="#features">Explore MahinBook <span aria-hidden="true">→</span></a>
                : <a className="btn btn-primary public-main-cta" href="/login">Get started <span aria-hidden="true">→</span></a>}
              <a className="public-secondary-cta" href="#features">See what you can do</a>
            </div>
            <p className="public-note">Create an account to build your profile and connect with friends.</p>
          </div>

          <div className="public-preview" aria-label="A preview of the MahinBook community feed">
            <div className="preview-topline"><span className="preview-mark"><BrandMark size={34} /></span><span className="preview-dot" /></div>
            <div className="preview-heading">Your world, in one place</div>
            <div className="preview-card preview-card-main">
              <div className="preview-person"><span className="preview-avatar preview-avatar-one">A</span><span><b>Friends & family</b><small>Share a moment together</small></span><span className="preview-more">···</span></div>
              <div className="preview-landscape"><span className="preview-sun" /><span className="preview-hill preview-hill-back" /><span className="preview-hill preview-hill-front" /></div>
              <div className="preview-reactions"><span>♥</span><span>☻</span><small>Good moments are better shared</small></div>
            </div>
            <div className="preview-float preview-float-chat"><span className="preview-avatar preview-avatar-two">M</span><span><b>Stay in touch</b><small>Your conversations, together</small></span><i aria-hidden="true">↗</i></div>
            <div className="preview-float preview-float-group"><span className="preview-group-icon">✳</span><span><b>Find your people</b><small>Groups, Pages & events</small></span></div>
          </div>
        </section>

        <section className="public-feature-section" id="features" aria-labelledby="features-title">
          <div className="public-section-heading">
            <p className="public-eyebrow">Made for connection</p>
            <h2 id="features-title">More ways to share life together</h2>
            <p>Bring your conversations, interests, and favorite moments into one welcoming social network.</p>
          </div>
          <div className="public-features">
            {features.map((feature) => (
              <article className="public-feature" key={feature.title}>
                <span className="public-feature-mark">{feature.mark}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
                <a href="/login" aria-label={`Explore ${feature.title} on MahinBook`}>Explore <span aria-hidden="true">↗</span></a>
              </article>
            ))}
          </div>
        </section>

        <section className="public-community" id="community" aria-labelledby="community-title">
          <div className="public-community-orbit" aria-hidden="true"><span>friends</span><span>groups</span><span>moments</span><span>you</span></div>
          <div>
            <p className="public-eyebrow">Your space, your choices</p>
            <h2 id="community-title">Share with the people who matter to you.</h2>
            <p>MahinBook includes audience and privacy settings so you can shape how you share and manage your account.</p>
            {staticLanding
              ? <a className="public-text-link" href="#features">Explore MahinBook <span aria-hidden="true">→</span></a>
              : <a className="public-text-link" href="/login">Make your space on MahinBook <span aria-hidden="true">→</span></a>}
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <a className="public-brand" href="/"><BrandMark size={32} /><span>mahinbook</span></a>
        <p>Connect with friends and communities on MahinBook.</p>
        <span>© {new Date().getFullYear()} MahinBook</span>
      </footer>
    </div>
  );
}
