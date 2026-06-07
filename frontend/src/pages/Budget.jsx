import { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "BRL"];

export default function Budget() {
  const { refresh } = useAuth();
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    const { data } = await api.get("/budget/settings");
    setS(data);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  if (!s) return <div className="text-muted-foreground">Loading…</div>;

  const total = Number(s.needs_pct) + Number(s.wants_pct) + Number(s.savings_pct);
  const valid = Math.abs(total - 100) < 0.01;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/budget/settings", {
        ...s,
        monthly_salary: Number(s.monthly_salary),
        needs_pct: Number(s.needs_pct),
        wants_pct: Number(s.wants_pct),
        savings_pct: Number(s.savings_pct),
      });
      await refresh();
      toast.success("Budget updated");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const preset = (n, w, sv) => setS({ ...s, needs_pct: n, wants_pct: w, savings_pct: sv });

  return (
    <div className="space-y-8 animate-fade-up max-w-3xl">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">Your budget plan</h1>
        <p className="text-muted-foreground text-sm">Set salary, currency, and how you want to split each paycheck.</p>
      </header>

      <Card className="rounded-2xl border-border">
        <CardHeader><CardTitle className="font-display">Salary & currency</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Monthly salary</Label>
            <Input type="number" min="0" step="0.01" value={s.monthly_salary}
              onChange={(e) => setS({ ...s, monthly_salary: e.target.value })}
              className="rounded-xl" data-testid="budget-salary-input" />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={s.currency} onValueChange={(v) => setS({ ...s, currency: v })}>
              <SelectTrigger className="rounded-xl" data-testid="budget-currency-select"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border">
        <CardHeader>
          <CardTitle className="font-display">Allocation</CardTitle>
          <p className="text-sm text-muted-foreground">Percentages must add up to 100.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => preset(50, 30, 20)} data-testid="preset-50-30-20">50 / 30 / 20</Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => preset(60, 20, 20)} data-testid="preset-60-20-20">60 / 20 / 20</Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => preset(40, 30, 30)} data-testid="preset-40-30-30">40 / 30 / 30 (aggressive saver)</Button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <PctInput label="Needs %" color="#2C4C3B" value={s.needs_pct} onChange={(v) => setS({ ...s, needs_pct: v })} testid="pct-needs" />
            <PctInput label="Wants %" color="#C86A53" value={s.wants_pct} onChange={(v) => setS({ ...s, wants_pct: v })} testid="pct-wants" />
            <PctInput label="Savings %" color="#D9984A" value={s.savings_pct} onChange={(v) => setS({ ...s, savings_pct: v })} testid="pct-savings" />
          </div>
          <div className={`text-sm ${valid ? "text-moss" : "text-destructive"}`} data-testid="pct-total">
            Total: {total}%
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={!valid || saving} className="rounded-full bg-moss hover:bg-moss-hover" data-testid="budget-save-button">
        {saving ? "Saving…" : "Save plan"}
      </Button>
    </div>
  );
}

function PctInput({ label, value, onChange, color, testid }) {
  return (
    <div className="space-y-2">
      <Label style={{ color }}>{label}</Label>
      <Input type="number" min="0" max="100" value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-xl" data-testid={testid} />
    </div>
  );
}
