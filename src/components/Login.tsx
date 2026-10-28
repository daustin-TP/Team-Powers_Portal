import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const signInWithGoogle = async () => {
    if (!supabase) return;
    setSubmitting(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessage("Google sign-in could not start. Please try again or contact your District Manager.");
      setSubmitting(false);
    }
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
          <p className="eyebrow">Welcome back</p>
          <h1>Your operation, moving smarter.</h1>
          <p>
            Sign in with the approved Google account connected to your DASH-OS access.
          </p>
          <button
            className="button google-button full"
            type="button"
            onClick={() => void signInWithGoogle()}
            disabled={submitting}
          >
            <span className="google-mark" aria-hidden="true">G</span>
            {submitting ? "Opening Google…" : "Continue with Google"}
          </button>
          {message && <p className="form-error">{message}</p>}
          <div className="login-security">
            <ShieldCheck size={18} />
            <span>Only preapproved team members can access the portal.</span>
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
