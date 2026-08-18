import { FormEvent, useState } from "react";
import { Check, FileCheck2, ShieldCheck } from "lucide-react";
import type { Profile } from "../types";
import { supabase } from "../lib/supabase";

export default function Payroll({ profile }: { profile: Profile }) {
  const [authorized, setAuthorized] = useState(false);
  const [signature, setSignature] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    if (supabase) {
      const { error: saveError } = await supabase.from("payroll_authorizations").insert({
        employee_id: profile.id,
        amount: 36,
        signature_name: signature.trim(),
        authorized: true,
        authorized_at: new Date().toISOString(),
      });
      if (saveError) {
        setError("The authorization could not be recorded. Please try again.");
        setSubmitting(false);
        return;
      }
    }
    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="page narrow-page">
      <div className="page-heading">
        <p className="eyebrow">Payroll authorization</p>
        <h1>Review before you authorize.</h1>
        <p>Confirm the amount and sign electronically. A copy will be saved with your employee record.</p>
      </div>
      {submitted ? (
        <section className="success-card">
          <span><Check size={26} /></span>
          <h2>Authorization recorded</h2>
          <p>A dated copy has been saved for {profile.fullName}.</p>
        </section>
      ) : (
        <form className="panel document-panel" onSubmit={submit}>
          <div className="document-title">
            <FileCheck2 size={30} />
            <div><h2>Uniform payroll deduction</h2><p>Employee authorization</p></div>
          </div>
          <div className="document-facts">
            <div><span>Employee</span><strong>{profile.fullName}</strong></div>
            <div><span>Location</span><strong>{profile.location}</strong></div>
            <div><span>Amount</span><strong>$36.00</strong></div>
            <div><span>Schedule</span><strong>Next payroll</strong></div>
          </div>
          <div className="legal-copy">
            <p>I voluntarily authorize Team Powers to deduct the amount shown above from my wages for the approved uniform items associated with my request.</p>
            <p>I understand that this authorization applies only to the stated amount and that I will receive a copy for my records.</p>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} />
            <span>I have reviewed the information above and authorize this payroll deduction.</span>
          </label>
          <label>Type your full legal name<input value={signature} onChange={(event) => setSignature(event.target.value)} placeholder={profile.fullName} /></label>
          <div className="security-note"><ShieldCheck size={19} /><span>Your email identity, date, and authorization record will be stored securely.</span></div>
          {error && <p className="form-error">{error}</p>}
          <button className="button primary" disabled={!authorized || signature.trim().length < 3 || submitting}>
            {submitting ? "Recording…" : "Sign and authorize"}
          </button>
        </form>
      )}
    </div>
  );
}

