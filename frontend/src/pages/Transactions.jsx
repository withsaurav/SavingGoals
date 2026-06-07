import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney, todayISO } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

const EXPENSE_CATEGORIES = ["Rent", "Groceries", "Utilities", "Transport", "Dining", "Entertainment", "Health", "Shopping", "Subscriptions", "Other"];
const INCOME_CATEGORIES = ["Bonus", "Freelance", "Investment", "Refund", "Gift", "Other"];

const BUCKETS_FOR_CATEGORY = {
  Rent: "needs", Groceries: "needs", Utilities: "needs", Transport: "needs", Health: "needs",
  Dining: "wants", Entertainment: "wants", Shopping: "wants", Subscriptions: "wants",
  Other: "needs",
};

export default function Transactions() {
  const { user } = useAuth();
  const [txs, setTxs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: "expense",
    amount: "",
    category: "Groceries",
    bucket: "needs",
    note: "",
    date: todayISO(),
  });

  const load = async () => {
    const { data } = await api.get("/transactions");
    setTxs(data);
  };

  useEffect(() => { load(); }, []);

  const onChange = (k, v) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "category" && f.type === "expense") {
        next.bucket = BUCKETS_FOR_CATEGORY[v] || "needs";
      }
      if (k === "type") {
        next.category = v === "expense" ? "Groceries" : "Bonus";
        next.bucket = v === "expense" ? "needs" : "income";
      }
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/transactions", { ...form, amount: Number(form.amount) });
      toast.success("Transaction added");
      setOpen(false);
      setForm((f) => ({ ...f, amount: "", note: "" }));
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const del = async (id) => {
    await api.delete(`/transactions/${id}`);
    toast.success("Removed");
    load();
  };

  const categories = form.type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground text-sm">Log every paycheck and expense.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-moss hover:bg-moss-hover" data-testid="open-add-transaction">
              <Plus className="w-4 h-4 mr-2" /> Add transaction
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display">New transaction</DialogTitle>
              <DialogDescription>Log an expense or income with date and category.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => onChange("type", v)}>
                    <SelectTrigger className="rounded-xl" data-testid="tx-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input type="number" required min="0" step="0.01" value={form.amount}
                    onChange={(e) => onChange("amount", e.target.value)} className="rounded-xl"
                    data-testid="tx-amount-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => onChange("category", v)}>
                    <SelectTrigger className="rounded-xl" data-testid="tx-category-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.type === "expense" && (
                  <div className="space-y-2">
                    <Label>Bucket</Label>
                    <Select value={form.bucket} onValueChange={(v) => onChange("bucket", v)}>
                      <SelectTrigger className="rounded-xl" data-testid="tx-bucket-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="needs">Needs</SelectItem>
                        <SelectItem value="wants">Wants</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => onChange("date", e.target.value)} className="rounded-xl" data-testid="tx-date-input" />
              </div>
              <div className="space-y-2">
                <Label>Note</Label>
                <Input value={form.note} onChange={(e) => onChange("note", e.target.value)} className="rounded-xl" data-testid="tx-note-input" />
              </div>
              <Button type="submit" className="w-full rounded-full bg-moss hover:bg-moss-hover" data-testid="tx-submit-button">
                Save
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <Card className="rounded-2xl border-border">
        <CardHeader><CardTitle className="font-display">All transactions</CardTitle></CardHeader>
        <CardContent>
          {txs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6">Nothing logged yet.</div>
          ) : (
            <ul className="divide-y divide-border" data-testid="tx-list">
              {txs.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium">{t.category} <span className="text-xs text-muted-foreground capitalize ml-2 px-2 py-0.5 bg-sage rounded-full">{t.bucket}</span></div>
                    <div className="text-xs text-muted-foreground">{t.note || "—"} · {t.date}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={t.type === "expense" ? "text-terracotta font-mono" : "text-moss font-mono"}>
                      {t.type === "expense" ? "−" : "+"}{fmtMoney(t.amount, user?.currency)}
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => del(t.id)} data-testid={`del-tx-${t.id}`}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
