export default function Home() {
  return (
    <main className="page-shell">
      <section className="triage-card" aria-labelledby="page-title">
        <div className="brand-mark" aria-hidden="true">S</div>
        <p className="eyebrow">Pause. Check. Act safely.</p>
        <h1 id="page-title">SurakshaSetu</h1>
        <p className="subtitle">Cyber Fraud Emergency Room</p>

        <div className="divider" />

        <div className="intro">
          <h2>Something feels off?</h2>
          <p>Share what you received and we’ll help you take a safer next step.</p>
        </div>

        <form className="triage-form">
          <label htmlFor="suspicious-message">What happened?</label>
          <textarea
            id="suspicious-message"
            name="suspicious-message"
            placeholder="Paste a suspicious message, call or payment request..."
            rows={6}
          />
          <button type="button" className="button button-primary">Check if it&apos;s a scam</button>
        </form>

        <div className="or"><span>or</span></div>

        <button type="button" className="button button-danger">I&apos;ve already been scammed</button>
        <p className="privacy-note">Don&apos;t share passwords, OTPs, card numbers, or bank PINs.</p>
      </section>
    </main>
  );
}
