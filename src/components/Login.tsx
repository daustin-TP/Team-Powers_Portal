import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState<"google" | "email" | null>(null);

  const signInWithGoogle = async () => {
    if (!supabase) return;
    setSubmitting("google");
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessage("Google sign-in could not start. Please try again or use an email link.");
      setSubmitting(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting("email");
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSubmitting(null);
    if (error) {
      setMessage("We couldn’t send the sign-in email. Please try again.");
      return;
    }
    setSent(true);
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <img
            className="brand-logo login-logo"
            src="/dash-sos-logo.png"
            alt="Dash-OS"
          />
          <div>
            <strong>Dash-OS</strong>
            <span>Team Powers Smart Operations System</span>
          </div>
        </div>

        {sent ? (
          <div className="login-content">
            <div className="success-icon">
              <CheckCircle2 size={30} />
            </div>
            <p className="eyebrow">Email sent</p>
            <h1>Check your inbox</h1>
            <p>
              We sent a secure sign-in link to <strong>{email}</strong>. The
              link expires automatically and can only be used once.
            </p>
            <button className="text-button" onClick={() => setSent(false)}>
              Use a different email
            </button>
          </div>
        ) : (
          <div className="login-content">
            <p className="eyebrow">Welcome back</p>
            <h1>Your operation, moving smarter.</h1>
            <p>
              Use your approved Google account for the fastest, most dependable sign-in.
            </p>
            <button
              className="button google-button full"
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={submitting !== null}
            >
              <span className="google-mark" aria-hidden="true">G</span>
              {submitting === "google" ? "Opening Google…" : "Continue with Google"}
            </button>
            <div className="login-divider"><span>or use an email link</span></div>
            <form onSubmit={submit}>
              <label htmlFor="email">Work email</label>
              <div className="input-with-icon">
                <Mail size={19} />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@powerspizza.com"
                  autoComplete="email"
                  required
                />
              </div>
              {message && <p className="form-error">{message}</p>}
              <button className="button primary full" disabled={submitting !== null}>
                {submitting === "email" ? "Sending…" : "Email me a sign-in link"}
                {submitting !== "email" && <ArrowRight size={18} />}
              </button>
            </form>
            <div className="login-security">
              <ShieldCheck size={18} />
              <span>Only preapproved team members can access the portal.</span>
            </div>
          </div>
        )}
      </section>

      <aside className="login-aside">
        <div className="quote-mark">“</div>
        <blockquote>
          Clear requests, quick approvals, and fewer loose ends.
        </blockquote>
        <p>Team Powers Smart Operations System</p>
      </aside>
    </main>
  );
}
