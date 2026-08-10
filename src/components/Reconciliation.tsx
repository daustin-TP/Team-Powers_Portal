import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Search } from "lucide-react";
import { supabase } from "../lib/supabase";

type Transaction = {
  id: string;
  date: string;
  person: string;
  vendor: string;
  amount: number;
  status: "Matched" | "Needs review";
};

const demoTransactions: Transaction[] = [
  { id: "1", date: "Jul 23", person: "Jordan Manager", vendor: "Restaurant Depot", amount: 184.62, status: "Needs review" },
  { id: "2", date: "Jul 22", person: "Delaney Austin", vendor: "Office Depot", amount: 47.18, status: "Matched" },
  { id: "3", date: "Jul 21", person: "Taylor Employee", vendor: "Home Depot", amount: 92.41, status: "Matched" },
];

export default function Reconciliation() {
  const [transactions, setTransactions] = useState<Transaction[]>(supabase ? [] : demoTransactions);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("card_receipts")
      .select("id,purchase_date,vendor,amount,status,profiles!card_receipts_employee_id_fkey(full_name)")
      .order("purchase_date", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setMessage("Transactions could not be loaded.");
          return;
        }
        setTransactions((data ?? []).map((receipt: any) => ({
          id: receipt.id,
          date: new Date(`${receipt.purchase_date}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" }),
          person: receipt.profiles?.full_name ?? "Team member",
          vendor: receipt.vendor,
          amount: Number(receipt.amount),
          status: receipt.status === "matched" ? "Matched" : "Needs review",
        })));
      });
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return transactions;
    return transactions.filter((transaction) =>
      `${transaction.person} ${transaction.vendor} ${transaction.amount}`.toLowerCase().includes(query),
    );
  }, [search, transactions]);

  const statementTotal = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const matched = transactions.filter((transaction) => transaction.status === "Matched").length;
  const needsReview = transactions.length - matched;
  const matchedPercent = transactions.length ? Math.round((matched / transactions.length) * 100) : 100;

  return (
    <div className="page">
      <div className="page-heading heading-with-action">
        <div><p className="eyebrow">Accounting</p><h1>Card reconciliation.</h1><p>Review submitted receipts and close the gaps before statement cutoff.</p></div>
        <button className="button secondary"><Download size={17} /> Export</button>
      </div>
      <div className="metric-grid">
        <div className="metric-card"><span>Submitted total</span><strong>${statementTotal.toFixed(2)}</strong><small>Current receipt records</small></div>
        <div className="metric-card"><span>Receipts matched</span><strong>{matchedPercent}%</strong><small>{matched} of {transactions.length} receipts</small></div>
        <div className="metric-card attention"><span>Needs attention</span><strong>{needsReview}</strong><small>Receipts awaiting review</small></div>
      </div>
      {message && <p className="inline-message">{message}</p>}
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div><h2>Recent transactions</h2><p>Receipts submitted by cardholders</p></div>
          <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transactions" /></label>
        </div>
        <div className="responsive-table">
          <table>
            <thead><tr><th>Date</th><th>Cardholder</th><th>Vendor</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>{filtered.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.date}</td><td>{transaction.person}</td><td>{transaction.vendor}</td><td><strong>${transaction.amount.toFixed(2)}</strong></td>
                <td><span className={`table-status ${transaction.status === "Matched" ? "matched" : "review"}`}>{transaction.status === "Matched" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{transaction.status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
