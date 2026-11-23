import { useState } from "react";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [teamMemberMode, setTeamMemberMode] = useState(new URLSearchParams(window.location.search).has("team"));
  const [email, setEmail] = useState("");

  const signInWithGoogle = async () => {
    if (!supabase) return;
    setSubmitting(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessage("Google sign-in could not start. Please try again or contact your Area Supervisor.");
      setSubmitting(false);
    }
  };

  const sendTeamMemberLink = async () => {
    if (!supabase || !email.trim()) return;
    setSubmitting(true); setMessage("");
    const { error } = await supabase.functions.invoke("team-member-auth", {
      body: { email: email.trim().toLowerCase() },
    });
    setSubmitting(false);
    setMessage(error
      ? "DASH could not send the secure sign-in email. Please wait a moment and try again."
      : "If this email belongs to an active team member, a secure sign-in link is on its way.");
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <img
            className="brand-logo login-logo"
            src="/dash-sos-logo.png"
            alt="DASHos"
          />
          <p>DASHos: Team Powers Operations System</p>
        </div>

        <div className="login-content">
          <p className="eyebrow">{teamMemberMode ? "Team member access" : "Welcome back"}</p>
          <h1>{teamMemberMode ? "Schedule and time off." : "Your operation, moving smarter."}</h1>
          <p>{teamMemberMode ? "Use the email saved by your manager. Any email provider is accepted." : "Sign in with the approved Google account connected to your DASH-OS access."}</p>
          {teamMemberMode ? <>
            <label className="team-member-login-email">Email address<input type="email" autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter")void sendTeamMemberLink();}} placeholder="name@example.com"/></label>
            <button className="button primary full" type="button" onClick={() => void sendTeamMemberLink()} disabled={submitting || !email.trim()}><Mail size={17}/>{submitting ? "Sending…" : "Email my secure sign-in"}</button>
            <button className="button text full" type="button" onClick={()=>{setTeamMemberMode(false);setMessage("");}}><ArrowLeft size={16}/>Back to DASH staff sign-in</button>
          </> : <><button
            className="button google-button full"
            type="button"
            onClick={() => void signInWithGoogle()}
            disabled={submitting}
          >
            <span className="google-mark" aria-hidden="true">G</span>
            {submitting ? "Opening Google…" : "Continue with Google"}
          </button>
          <button className="button secondary full team-member-access-button" type="button" onClick={()=>{setTeamMemberMode(true);setMessage("");}}><Mail size={17}/>Team member schedule &amp; requests</button></>}
          {message && <p className="form-error">{message}</p>}
          <div className="login-security">
            <ShieldCheck size={18} />
            <span>{teamMemberMode ? "Access works only while your roster status is active." : "Only preapproved DASH users can access the operations portal."}</span>
          </div>
        </div>
      </section>

      <aside className="login-aside">
        <img className="login-team-powers-logo" src="/team-powers-crest.png" alt="Team Powers" />
        <div className="login-aside-copy">
          <p>Built for Team Powers</p>
          <h2>One team.<br/>One operating system.</h2>
        </div>
      </aside>
    </main>
  );
}
