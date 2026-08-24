"use client";

import { FormEvent, useState } from "react";

type Analysis = { verdict: "green" | "yellow" | "red"; scam_type: string; red_flags: string[]; what_to_do: string[]; how_it_works: string };

const verdictCopy = { green: "Looks safe", yellow: "Be carefull", red: "This is almost certainly a scam" } as const;
const MAX_MESSAGE_LENGTH = 5_000;
const clientFallback: Analysis = { verdict: "yellow", scam_type: "Treat this as suspicious", red_flags: ["We couldn't analyse that — treat it as suspicious and avoid sharing details."], what_to_do: ["Do not pay or share personal or financial details.", "Do not click links or approve payment requests.", "Block the sender if they pressure you.", "Report suspected fraud at cybercrime.gov.in or call 1930."], how_it_works: "When a message cannot be checked, pausing and verifying independently is the safest next step." };

const examples = [
  {
    label: "Digital arrest call",
    text: "A caller claiming to be from CBI says a parcel linked to my Aadhaar contains illegal items. They want me to join a video call and transfer money for verification or I will be arrested today.",
  },
  {
    label: "Unexpected UPI collect request",
    text: "I received a UPI collect request saying it is a refund. It asks me to enter my UPI PIN to receive ₹2,000. I was not expecting any refund.",
  },
  {
    label: "KYC phishing SMS",
    text: "Your bank KYC will expire today. Click the link below and enter your card details and OTP immediately to avoid account suspension.",
  },
] as const;

function isAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (item.verdict === "green" || item.verdict === "yellow" || item.verdict === "red") && typeof item.scam_type === "string" && Array.isArray(item.red_flags) && item.red_flags.every((flag) => typeof flag === "string") && Array.isArray(item.what_to_do) && item.what_to_do.every((step) => typeof step === "string") && typeof item.how_it_works === "string";
}

export default function Home() {
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isEmergency, setIsEmergency] = useState(false);
  const [isCaseStatus, setIsCaseStatus] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [description, setDescription] = useState("");
  const [complaint, setComplaint] = useState("");
  const [complaintError, setComplaintError] = useState("");
  const [isGeneratingComplaint, setIsGeneratingComplaint] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) { setError("Paste the message, call details, or payment request first."); return; }
    if (text.length > MAX_MESSAGE_LENGTH) { setError("Please keep the message to 5,000 characters or fewer."); return; }
    setError(""); setAnalysis(null); setIsLoading(true);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const payload: unknown = await response.json();
      if (!response.ok || !isAnalysis(payload)) throw new Error("Analysis request failed");
      setAnalysis(payload);
    } catch {
      setAnalysis(clientFallback);
    } finally { setIsLoading(false); }
  }

  function reset() { setAnalysis(null); setError(""); }

  async function generateComplaint() {
    if (!amount.trim() || !method || !description.trim()) {
      setComplaintError("Add the amount, payment method, and what happened so we can draft your complaint.");
      return;
    }

    setComplaintError(""); setComplaint(""); setCopyStatus(""); setIsGeneratingComplaint(true);
    try {
      const response = await fetch("/api/complaint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description, amount, method }) });
      const draft = await response.text();
      if (!response.ok || !draft.trim()) throw new Error("Complaint request failed");
      setComplaint(draft);
    } catch {
      setComplaint(`I am reporting a suspected cyber fraud. I was contacted and the following happened: ${description.trim()}\n\nThe approximate amount involved is ${amount.trim()}, and the payment method was ${method.trim()}.\n\nI request that the relevant transaction and recipient account be checked immediately, and that action be taken to freeze or recover the funds if possible.`);
      setComplaintError("We couldn't connect to the drafting service, so we prepared a basic complaint from your notes instead.");
    } finally { setIsGeneratingComplaint(false); }
  }

  async function copyComplaint() {
    try {
      await navigator.clipboard.writeText(complaint);
      setCopyStatus("Copied to clipboard.");
    } catch { setCopyStatus("Copy failed. Select the text and copy it manually."); }
  }

  return <main className="page-shell"><section className="triage-card" aria-labelledby="page-title">
    <header className="app-header"><div className="brand-mark" aria-hidden="true">S</div><div><h1 id="page-title">SurakshaSetu</h1><p>Cyber Fraud Emergency Room</p></div></header><button type="button" className="case-status-link" onClick={() => { setIsCaseStatus(true); setIsEmergency(false); setAnalysis(null); }}>Case Status</button><p className="eyebrow">Pause. Check. Act safely.</p><div className="divider" />
    {isCaseStatus ? <section className="case-status" aria-labelledby="case-status-title">
      <p className="mock-label">Illustrative mock only</p>
      <h2 id="case-status-title">Case Status</h2>
      <p className="case-status-intro">This is an example of how a complaint status may appear. It is not connected to cybercrime.gov.in.</p>
      <div className="reference-card"><span>Mock reference number</span><strong>CYB-2026-0819-4721</strong></div>
      <ol className="case-timeline"><li className="timeline-complete"><span aria-hidden="true">✓</span><div><h3>Filed</h3><p>Your complaint was submitted.</p></div></li><li className="timeline-complete"><span aria-hidden="true">✓</span><div><h3>Acknowledged</h3><p>Your complaint has been received.</p></div></li><li className="timeline-current"><span aria-hidden="true">3</span><div><h3>Under Review</h3><p>The relevant team is reviewing the details.</p></div></li></ol>
      <button type="button" className="back-link" onClick={() => setIsCaseStatus(false)}>← Back to SurakshaSetu</button>
    </section> : isEmergency ? <section className="emergency-mode" aria-labelledby="emergency-title">
      <p className="emergency-eyebrow">Emergency mode</p>
      <h2 id="emergency-title">You’re not alone. Take these steps now.</h2>
      <p className="emergency-intro">Move one step at a time. Acting quickly can help protect your money.</p>
      <ol className="emergency-steps">
        <li><div><h3><a className="call-link" href="tel:1930">Call 1930 now</a></h3><p>Report within the first hour to maximise chances of freezing the money.</p></div></li>
        <li><div><h3>Call your bank or payment app</h3><p>Ask them to freeze or stop the transfer immediately.</p><div className="bank-script"><strong>You can say:</strong><p>“I think I have been scammed. Please freeze or stop this transfer. The approximate amount is [amount], paid by [method]. Please tell me the complaint reference number.”</p></div></div></li>
        <li><div><h3>Keep the details ready</h3><div className="emergency-fields"><label htmlFor="amount-lost">Approximate amount lost<input id="amount-lost" name="amount-lost" type="text" inputMode="decimal" placeholder="For example, ₹5,000" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label htmlFor="payment-method">Payment method<select id="payment-method" name="payment-method" value={method} onChange={(event) => setMethod(event.target.value)}><option value="" disabled>Select a method</option><option value="UPI">UPI</option><option value="card">Card</option><option value="bank transfer">Bank transfer</option><option value="other">Other</option></select></label></div></div></li>
        <li><div><h3>Write down what happened</h3><label className="sr-only" htmlFor="emergency-description">Describe what happened</label><textarea id="emergency-description" name="emergency-description" rows={5} placeholder="Describe what happened: who contacted you, what you paid, and when..." value={description} onChange={(event) => setDescription(event.target.value)} /></div></li>
      </ol>
      {complaintError && <p className="form-error" role="alert">{complaintError}</p>}
      <button type="button" className="button button-emergency" onClick={generateComplaint} disabled={isGeneratingComplaint}>{isGeneratingComplaint ? "Drafting your complaint…" : "Generate my complaint"}</button>
      <p className="complaint-note">This will help turn your notes into a clear complaint.</p>
      {complaint && <section className="complaint-draft" aria-live="polite"><h3>Your complaint draft</h3><textarea readOnly value={complaint} rows={11} aria-label="Your complaint draft" /><button type="button" className="button button-secondary" onClick={copyComplaint}>Copy</button>{copyStatus && <p role="status">{copyStatus}</p>}</section>}
      <button type="button" className="back-link" onClick={() => setIsEmergency(false)}>← Back to scam check</button>
    </section> : analysis ? <section className="analysis-result" aria-live="polite" aria-label="Scam analysis result">
      <div className={`verdict-banner verdict-${analysis.verdict}`}><p>Our assessment</p><h2>{verdictCopy[analysis.verdict]}</h2><span>{analysis.scam_type}</span></div>
      <section className="result-section"><h3>Why</h3><ul className="flag-list">{analysis.red_flags.map((flag, index) => <li key={`${flag}-${index}`}>{flag}</li>)}</ul></section>
      <section className="result-section action-section"><h3>Do this now</h3><ul className="checklist">{analysis.what_to_do.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ul></section>
      <aside className="how-it-works"><h3>So you spot it next time</h3><p>{analysis.how_it_works}</p></aside><button type="button" className="button button-secondary" onClick={reset}>Check another message</button>
    </section> : <>
      <div className="intro"><h2>Something feels off?</h2><p>Share what you received and we’ll help you take a safer next step.</p></div>
      <form className="triage-form" onSubmit={handleSubmit}><label htmlFor="suspicious-message">What happened?</label><div className="example-chips" aria-label="Try an example">{examples.map((example) => <button key={example.label} type="button" className="example-chip" disabled={isLoading} onClick={() => { setText(example.text); setError(""); }}>{example.label}</button>)}</div><textarea id="suspicious-message" name="suspicious-message" placeholder="Paste a suspicious message, call or payment request..." rows={6} value={text} maxLength={MAX_MESSAGE_LENGTH} onChange={(event) => setText(event.target.value)} disabled={isLoading} />{text.length > 0 && <p className="character-count">{text.length.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}</p>}{error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button button-primary" disabled={isLoading}>{isLoading ? "Checking safely…" : "Check if it’s a scam"}</button></form>
      <div className="or"><span>or</span></div><button type="button" className="button button-danger" onClick={() => setIsEmergency(true)}>I&apos;ve already been scammed</button><p className="privacy-note">Don&apos;t share passwords, OTPs, card numbers, or bank PINs.</p>
    </>}
    <p className="trust-line">We never ask for your OTP or bank details. Guidance only — not legal advice.</p>
  </section></main>;
}
