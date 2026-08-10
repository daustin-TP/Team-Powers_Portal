import { FormEvent, useState } from "react";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import type { Profile } from "../types";
import { supabase } from "../lib/supabase";

const items = [
  { id: "tee", name: "Team Powers T-shirt", price: 18, description: "Soft cotton blend · Black" },
  { id: "polo", name: "Manager polo", price: 32, description: "Embroidered logo · Forest green" },
  { id: "hat", name: "Team hat", price: 16, description: "Adjustable · Black" },
  { id: "apron", name: "Kitchen apron", price: 24, description: "Heavy-duty canvas · Black" },
];

export default function Uniforms({ profile }: { profile: Profile }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [size, setSize] = useState("M");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const total = items.reduce(
    (sum, item) => sum + (quantities[item.id] ?? 0) * item.price,
    0,
  );

  const adjust = (id: string, change: number) =>
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, (current[id] ?? 0) + change),
    }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    if (supabase) {
      const selectedItems = items
        .filter((item) => (quantities[item.id] ?? 0) > 0)
        .map((item) => ({
          id: item.id,
          name: item.name,
          quantity: quantities[item.id],
          unit_price: item.price,
          size: ["tee", "polo"].includes(item.id) ? size : null,
        }));
      const { error: saveError } = await supabase.from("uniform_requests").insert({
        employee_id: profile.id,
        location: profile.location,
        shirt_size: size,
        items: selectedItems,
        estimated_total: total,
        notes: "",
        status: "submitted",
      });
      if (saveError) {
        setError("Your request could not be saved. Please try again.");
        setSubmitting(false);
        return;
      }
    }
    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">Uniforms</p>
        <h1>Order what you need.</h1>
        <p>Select approved items. Your manager will review the request before it is ordered.</p>
      </div>

      {submitted ? (
        <section className="success-card">
          <span><Check size={26} /></span>
          <h2>Request submitted</h2>
          <p>Your uniform request is ready for manager review. We’ll email you when its status changes.</p>
          <button className="button secondary" onClick={() => setSubmitted(false)}>Start another request</button>
        </section>
      ) : (
        <form className="form-layout" onSubmit={submit}>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Approved items</h2>
                <p>Default size applies to shirts and polos.</p>
              </div>
              <label className="compact-field">
                Size
                <select value={size} onChange={(event) => setSize(event.target.value)}>
                  {["XS", "S", "M", "L", "XL", "2XL", "3XL"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="product-list">
              {items.map((item) => (
                <div className="product-row" key={item.id}>
                  <span className="product-art"><ShoppingBag size={22} /></span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </div>
                  <span className="price">${item.price}</span>
                  <div className="stepper">
                    <button type="button" aria-label={`Remove ${item.name}`} onClick={() => adjust(item.id, -1)}><Minus size={15} /></button>
                    <span>{quantities[item.id] ?? 0}</span>
                    <button type="button" aria-label={`Add ${item.name}`} onClick={() => adjust(item.id, 1)}><Plus size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <aside className="summary-card">
            <p className="eyebrow">Request summary</p>
            <h2>{profile.fullName}</h2>
            <dl>
              <div><dt>Location</dt><dd>{profile.location}</dd></div>
              <div><dt>Shirt size</dt><dd>{size}</dd></div>
              <div><dt>Items</dt><dd>{Object.values(quantities).reduce((a, b) => a + b, 0)}</dd></div>
              <div className="summary-total"><dt>Estimated total</dt><dd>${total.toFixed(2)}</dd></div>
            </dl>
            <label>Notes for your manager<textarea rows={3} placeholder="Optional sizing or item notes" /></label>
            {error && <p className="form-error">{error}</p>}
            <button className="button primary full" disabled={total === 0 || submitting}>
              {submitting ? "Submitting…" : "Submit request"}
            </button>
          </aside>
        </form>
      )}
    </div>
  );
}
