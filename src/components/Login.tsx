import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSubmitting(false);
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
          <div className="brand-mark">TP</div>
          <div>
            <strong>Team Powers</strong>
            <span>Employee portal</span>
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
            <h1>Everything your team needs, in one simple place.</h1>
            <p>
              Sign in with your Team Powers work email. No password required.
            </p>
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
              <button className="button primary full" disabled={submitting}>
                {submitting ? "Sending…" : "Email me a sign-in link"}
                {!submitting && <ArrowRight size={18} />}
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
        <p>Built for the people who keep Team Powers moving.</p>
      </aside>
    </main>
  );
}

