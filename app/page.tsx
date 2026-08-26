"use client";

import { FormEvent, useState, useEffect } from "react";

type AnalysisState = "about-to-be" | "mid-attack" | "already-scammed" | "data-at-risk" | "clarify" | "out-of-scope";

type Analysis = {
  state: AnalysisState;
  verdict: "green" | "yellow" | "red";
  scam_type: string;
  red_flags: string[];
  what_to_do: string[];
  how_it_works: string;
  clarifying_question: string;
};

const verdictCopy = { green: "Looks safe", yellow: "Be careful", red: "This is almost certainly a scam" } as const;
const MAX_MESSAGE_LENGTH = 5_000;
const clientFallback: Analysis = { 
  state: "clarify", 
  verdict: "yellow", 
  scam_type: "Need more information", 
  red_flags: [], 
  what_to_do: [], 
  how_it_works: "",
  clarifying_question: "We couldn't completely analyze that. Could you describe exactly what happened or paste the message?",
};

const examples = [
  { label: "a suspicious link", text: "Your bank KYC will expire today. Click the link below to verify." },
  { label: "a call asking for an OTP", text: "CBI is on video call saying I need to verify my identity and pay a fee." },
  { label: "already paid", text: "I just transferred 5000 via UPI for a part time job offer." },
] as const;

function isAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return ["about-to-be", "mid-attack", "already-scammed", "data-at-risk", "clarify", "out-of-scope"].includes(item.state as string) && (item.verdict === "green" || item.verdict === "yellow" || item.verdict === "red") && typeof item.scam_type === "string" && Array.isArray(item.red_flags) && item.red_flags.every((flag) => typeof flag === "string") && Array.isArray(item.what_to_do) && item.what_to_do.every((step) => typeof step === "string") && typeof item.how_it_works === "string" && typeof item.clarifying_question === "string";
}

export default function Home() {
  const [view, setView] = useState<"triage-form" | "verdict" | "recovery" | "case-status">("triage-form");
  const [recoveryStep, setRecoveryStep] = useState(1);
  
  // Triage Input State
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [clarification, setClarification] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Recovery State
  const [amount, setAmount] = useState("");
  const [when, setWhen] = useState("");
  const [method, setMethod] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [hasEvidence, setHasEvidence] = useState("");
  
  const [description, setDescription] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [upiId, setUpiId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bank, setBank] = useState("");
  
  const [complaint, setComplaint] = useState("");
  const [complaintError, setComplaintError] = useState("");
  const [isGeneratingComplaint, setIsGeneratingComplaint] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  
  // Timer State
  const [timeLeft, setTimeLeft] = useState(600);
  
  useEffect(() => {
    if (view === "recovery" && recoveryStep === 2) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [view, recoveryStep]);

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.length > MAX_MESSAGE_LENGTH) { setError("Please keep the message to 5,000 characters or fewer."); return; }
    
    // We do NOT block on empty text here anymore. We let the API's Guard 1 handle it.
    // However, if the user hits submit on a perfectly empty box, we can just show the clarification immediately to save a network request.
    if (!text.trim()) {
      setClarification("Tell me what happened — paste the message, or describe the call.");
      setError("");
      return;
    }

    setError(""); 
    setClarification("");
    setAnalysis(null); 
    setIsLoading(true);
    
    let currentAnalysis = clientFallback;
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const payload: unknown = await response.json();
      if (response.ok && isAnalysis(payload)) {
        currentAnalysis = payload;
      }
    } catch {
      // Fallback already assigned
    } finally { 
      setIsLoading(false); 
      setAnalysis(currentAnalysis);
      
      if (currentAnalysis.state === "out-of-scope") {
        setError("I can only help with suspected cyber fraud. Describe the message or call you're worried about.");
        setView("triage-form");
      } else if (currentAnalysis.state === "clarify") {
        setClarification(currentAnalysis.clarifying_question);
        setView("triage-form");
      } else if (currentAnalysis.state === "already-scammed") {
        setDescription(text); // Pre-fill description
        setRecoveryStep(1);
        setView("recovery");
      } else {
        // data-at-risk, mid-attack, about-to-be
        setView("verdict");
      }
    }
  }

  function resetToHome() {
    setView("triage-form");
    setAnalysis(null);
    setText("");
    setError("");
    setClarification("");
  }

  function getTriageVerdict() {
    if (method === "UPI" || method === "bank transfer") {
      if (when === "Just now" || when === "Within 24 hours") {
        return { type: "red", text: "Confirmed fraud pattern — you may still be able to freeze it. Act now." };
      }
      return { type: "yellow", text: "Confirmed fraud pattern. Follow the steps below." };
    }
    return { type: "yellow", text: "Suspicious activity detected. Follow the steps below." };
  }

  async function generateComplaint() {
    let fullDescription = description.trim();
    if (transactionId) fullDescription += `\nTransaction ID: ${transactionId}`;
    if (upiId) fullDescription += `\nUPI ID: ${upiId}`;
    if (phoneNumber) fullDescription += `\nPhone Number: ${phoneNumber}`;
    if (bank) fullDescription += `\nBank: ${bank}`;

    setComplaintError(""); setComplaint(""); setCopyStatus(""); setIsGeneratingComplaint(true);
    try {
      const response = await fetch("/api/complaint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: fullDescription, amount, method }) });
      const draft = await response.text();
      if (!response.ok || !draft.trim()) throw new Error("Complaint request failed");
      setComplaint(draft);
      setRecoveryStep(4);
    } catch {
      setComplaint(`I am reporting a suspected cyber fraud. I was contacted and the following happened: ${description.trim()}\n\nThe approximate amount involved is ${amount.trim()}, and the payment method was ${method.trim()}.\nTransaction ID: ${transactionId}\nUPI ID: ${upiId}\nPhone Number: ${phoneNumber}\nBank: ${bank}\n\nI request that the relevant transaction and recipient account be checked immediately, and that action be taken to freeze or recover the funds if possible.`);
      setComplaintError("We couldn't connect to the drafting service, so we prepared a basic complaint from your notes instead.");
      setRecoveryStep(4);
    } finally { setIsGeneratingComplaint(false); }
  }

  async function copyComplaint() {
    try {
      await navigator.clipboard.writeText(complaint);
      setCopyStatus("Copied to clipboard.");
    } catch { setCopyStatus("Copy failed. Select the text and copy it manually."); }
  }

  function calculateEvidenceScore() {
    let score = 0;
    if (transactionId) score += 25;
    if (upiId || bank) score += 25;
    if (phoneNumber) score += 25;
    if (description) score += 25;
    return score;
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const triageVerdict = getTriageVerdict();
  const evidenceScore = calculateEvidenceScore();

  return (
    <main className="page-shell">
      <section className="triage-card" aria-labelledby="page-title">
        <header className="app-header">
          <div className="brand-mark" aria-hidden="true">S</div>
          <div>
            <h1 id="page-title" onClick={resetToHome} style={{cursor: "pointer"}} title="Back to Home">SurakshaSetu</h1>
            <p>Cyber Fraud Emergency Room</p>
          </div>
        </header>
        <button type="button" className="case-status-link" onClick={() => { setView("case-status"); setAnalysis(null); }}>Case Status</button>
        <p className="eyebrow">Pause. Check. Act safely.</p>
        <div className="divider" />

        {view === "triage-form" && (
          <section className="happening-now-form slide-in">
            <div className="intro">
              <h2>Tell us what's happening</h2>
              <p>We'll figure out if it's a scam and guide you on exactly what to do next.</p>
            </div>
            
            {clarification && (
              <div className="clarification-banner" role="status" aria-live="polite">
                <p><strong>Wait:</strong> {clarification}</p>
              </div>
            )}

            <form className="triage-form" onSubmit={handleAnalyze}>
              <div className="example-chips" aria-label="Try an example">
                {examples.map((example) => (
                  <button key={example.label} type="button" className="example-chip" disabled={isLoading} onClick={() => { setText(example.text); setError(""); setClarification(""); }}>
                    {example.label}
                  </button>
                ))}
              </div>
              <textarea id="suspicious-message" name="suspicious-message" placeholder="Paste the message, or describe the situation..." rows={6} value={text} maxLength={MAX_MESSAGE_LENGTH} onChange={(event) => setText(event.target.value)} disabled={isLoading} />
              {text.length > 0 && <p className="character-count">{text.length.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" className="button button-primary" disabled={isLoading}>{isLoading ? "Checking safely…" : "Check it now"}</button>
            </form>
            <p className="privacy-note mt-6 text-center">We never ask for your passwords, OTPs, or bank PINs.</p>
          </section>
        )}

        {view === "case-status" && (
          <section className="case-status slide-in" aria-labelledby="case-status-title">
            <p className="mock-label">Illustrative mock only</p>
            <h2 id="case-status-title">Case Status</h2>
            <p className="case-status-intro">This is an example of how a complaint status may appear. It is not connected to cybercrime.gov.in.</p>
            <div className="reference-card"><span>Mock reference number</span><strong>CYB-2026-0819-4721</strong></div>
            <ol className="case-timeline">
              <li className="timeline-complete"><span aria-hidden="true">✓</span><div><h3>Filed</h3><p>Your complaint was submitted.</p></div></li>
              <li className="timeline-complete"><span aria-hidden="true">✓</span><div><h3>Acknowledged</h3><p>Your complaint has been received.</p></div></li>
              <li className="timeline-current"><span aria-hidden="true">3</span><div><h3>Under Review</h3><p>The relevant team is reviewing the details.</p></div></li>
            </ol>
            <button type="button" className="back-link" onClick={resetToHome}>← Back to Home</button>
          </section>
        )}

        {view === "verdict" && analysis && (
          <section className="analysis-result slide-in" aria-live="polite" aria-label="Scam analysis result">
            <div className={`verdict-banner verdict-${analysis.verdict}`}>
              <p>
                {analysis.state === 'mid-attack' ? 'LIVE COACHING' : 
                 analysis.state === 'data-at-risk' ? 'DATA AT RISK' : 'OUR ASSESSMENT'}
              </p>
              <h2>
                {analysis.state === 'mid-attack' ? 'This is a scam. Hang up.' : verdictCopy[analysis.verdict]}
              </h2>
              <span>{analysis.scam_type}</span>
            </div>
            <section className="result-section action-section">
              <h3>
                {analysis.state === 'mid-attack' ? 'Do this RIGHT NOW' : 
                 analysis.state === 'data-at-risk' ? 'Protect yourself now' : 'Precautions to take'}
              </h3>
              <ul className="checklist">{analysis.what_to_do.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ul>
            </section>
            
            {analysis.red_flags.length > 0 && (
              <section className="result-section">
                <h3>Red Flags</h3>
                <ul className="flag-list">{analysis.red_flags.map((flag, index) => <li key={`${flag}-${index}`}>{flag}</li>)}</ul>
              </section>
            )}

            {analysis.how_it_works && (
              <aside className="how-it-works">
                <h3>How it works</h3>
                <p>{analysis.how_it_works}</p>
              </aside>
            )}
            <button type="button" className="button button-secondary" onClick={resetToHome}>Check another message</button>
          </section>
        )}

        {view === "recovery" && (
          <section className="recovery-flow slide-in" aria-labelledby="recovery-title">
            <div className="recovery-progress">
              <span className={recoveryStep >= 1 ? "active" : ""}>Triage</span>
              <span className={recoveryStep >= 2 ? "active" : ""}>Checklist</span>
              <span className={recoveryStep >= 3 ? "active" : ""}>Evidence</span>
              <span className={recoveryStep >= 4 ? "active" : ""}>Done</span>
            </div>
            
            {recoveryStep === 1 && (
              <div className="recovery-step slide-in">
                <h2 id="recovery-title" className="step-title">Let's act quickly.</h2>
                <div className="emergency-fields">
                  <label>Approximate amount lost
                    <input type="text" placeholder="e.g. ₹5,000" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </label>
                  <label>When did it happen?
                    <select value={when} onChange={(e) => setWhen(e.target.value)}>
                      <option value="">Select timeframe</option>
                      <option value="Just now">Just now (within 1 hour)</option>
                      <option value="Within 24 hours">Within 24 hours</option>
                      <option value="Older">More than a day ago</option>
                    </select>
                  </label>
                  <label>Payment method
                    <select value={method} onChange={(e) => setMethod(e.target.value)}>
                      <option value="">Select method</option>
                      <option value="UPI">UPI</option>
                      <option value="bank transfer">Bank Transfer</option>
                      <option value="card">Card</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>
                <button type="button" className="button button-danger mt-4" onClick={() => {
                  if(amount && when && method) setRecoveryStep(2);
                }} disabled={!amount || !when || !method}>Next Step</button>
                <button type="button" className="back-link" onClick={resetToHome}>← Cancel and go back</button>
              </div>
            )}

            {recoveryStep === 2 && (
              <div className="recovery-step slide-in">
                <div className={`verdict-banner verdict-${triageVerdict.type} mb-4`}>
                  <p>Verdict</p>
                  <h2 className="verdict-heading" style={{fontSize: "1.2rem", margin: "6px 0"}}>{triageVerdict.text}</h2>
                </div>
                <h2 className="step-title mt-4">Golden-Hour Checklist</h2>
                <div className="timer-box">
                  <span className="timer-icon">⏱</span> {formatTime(timeLeft)}
                </div>
                <ol className="emergency-steps">
                  <li><div><h3><a className="call-link" href="tel:1930">Call 1930 now</a></h3><p>Report immediately to maximise chances of freezing the money.</p></div></li>
                  <li><div><h3>Call your bank or payment app</h3><p>Ask them to freeze the transfer.</p><div className="bank-script"><strong>Say this:</strong><p>“I have been scammed. Please freeze this transfer. The amount is {amount || "[amount]"}, paid by {method || "[method]"}. Please give me a complaint reference number.”</p></div></div></li>
                  <li><div><h3>Do not delete anything</h3><p>Save transaction IDs, chats, and SMS. Screenshot everything.</p></div></li>
                </ol>
                <button type="button" className="button button-primary mt-4" onClick={() => setRecoveryStep(3)}>I have done these, proceed to report</button>
                <button type="button" className="back-link" onClick={() => setRecoveryStep(1)}>← Back</button>
              </div>
            )}

            {recoveryStep === 3 && (
              <div className="recovery-step slide-in">
                <h2 className="step-title">Evidence Collector</h2>
                <p className="emergency-intro" style={{textAlign: "left"}}>Gather details to draft a strong complaint.</p>
                
                <div className="evidence-score-box">
                  <span>Evidence Strength</span>
                  <div className="score-bar"><div className="score-fill" style={{width: `${evidenceScore}%`, backgroundColor: evidenceScore > 50 ? '#4a9d74' : '#e6b800'}}></div></div>
                  <strong>{evidenceScore}/100</strong>
                </div>

                <div className="emergency-fields">
                  <label>Transaction ID / UTR
                    <input type="text" placeholder="e.g. 123456789012" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
                  </label>
                  <label>Scammer's UPI ID or Bank Details
                    <input type="text" placeholder="e.g. scammer@bank" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
                  </label>
                  <label>Scammer's Phone Number
                    <input type="tel" placeholder="e.g. +91 9876543210" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                  </label>
                  <label>Briefly describe what happened
                    <textarea rows={4} placeholder="Who contacted you, what you paid, and when..." value={description} onChange={(e) => setDescription(e.target.value)} />
                  </label>
                </div>
                
                {complaintError && <p className="form-error" role="alert">{complaintError}</p>}
                <button type="button" className="button button-danger mt-4" onClick={generateComplaint} disabled={isGeneratingComplaint || !description}>
                  {isGeneratingComplaint ? "Drafting your complaint…" : "Draft Complaint"}
                </button>
                <p className="complaint-note">This will send your notes to our drafting engine.</p>
                <button type="button" className="back-link" onClick={() => setRecoveryStep(2)}>← Back</button>
              </div>
            )}

            {recoveryStep === 4 && (
              <div className="recovery-step slide-in">
                <h2 className="step-title">Submission Confirmation</h2>
                <div className="reference-card text-center mb-6">
                  <span>Mock Complaint ID</span>
                  <strong>NCRP-2026-08-{Math.floor(Math.random()*90000) + 10000}</strong>
                  <p className="text-sm mt-2 text-green-700 font-semibold">Bank freeze request initiated</p>
                </div>
                
                <section className="complaint-draft" aria-live="polite">
                  <h3>Your auto-drafted complaint</h3>
                  <textarea readOnly value={complaint} rows={8} aria-label="Your complaint draft" />
                  <button type="button" className="button button-secondary" onClick={copyComplaint}>Copy to Clipboard</button>
                  {copyStatus && <p role="status" className="mt-2 text-center text-sm">{copyStatus}</p>}
                </section>
                
                <div className="next-steps-card mt-6">
                  <h3>What happens next?</h3>
                  <ul className="checklist">
                    <li>The bank has been notified to attempt a freeze.</li>
                    <li>Police will review your complaint within 24-48 hours.</li>
                    <li>You can track the status using the complaint ID.</li>
                  </ul>
                </div>
                <button type="button" className="button button-primary mt-6" onClick={() => setView("case-status")}>Track Case Status</button>
                <button type="button" className="back-link" onClick={resetToHome}>← Back to Home</button>
              </div>
            )}
          </section>
        )}

        <p className="trust-line">We never ask for your OTP or bank details. Guidance only — not legal advice.</p>
      </section>
    </main>
  );
}
