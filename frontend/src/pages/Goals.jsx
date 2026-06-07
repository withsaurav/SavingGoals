import { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Plus, Target, Trash2, CalendarClock, Sparkles } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

export default function Goals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [settings, setSettings] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", target_amount: "", saved_amount: 0, deadline: "" });

  const load = useCallback(async () => {
    const [g, s] = await Promise.all([api.get("/goals"), api.get("/budget/settings")]);
    setGoals(g.data);
    setSettings(s.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/goals", {
        name: form.name,
        target_amount: Number(form.target_amount),
        saved_amount: Number(form.saved_amount),
        deadline: form.deadline || null,
      });
      toast.success("Goal added");
      setOpen(false);
      setForm({ name: "", target_amount: "", saved_amount: 0, deadline: "" });
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const contribute = async (g, delta) => {
    const next = Math.max(0, (g.saved_amount || 0) + delta);
    await api.put(`/goals/${g.id}`, {
      name: g.name, target_amount: g.target_amount,
      saved_amount: next, deadline: g.deadline || null,
    });
    load();
  };

  const del = async (id) => {
    await api.delete(`/goals/${id}`);
    toast.success("Goal removed");
    load();
  };

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">Savings goals</h1>
          <p className="text-muted-foreground text-sm">Plant your goals. Water them weekly.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-moss hover:bg-moss-hover" data-testid="open-add-goal">
              <Plus className="w-4 h-4 mr-2" /> New goal
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display">New goal</DialogTitle>
              <DialogDescription>Track progress toward a savings target.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl" data-testid="goal-name-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Target amount</Label>
                  <Input required type="number" min="1" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} className="rounded-xl" data-testid="goal-target-input" />
                </div>
                <div className="space-y-2">
                  <Label>Starting balance</Label>
                  <Input type="number" min="0" value={form.saved_amount} onChange={(e) => setForm({ ...form, saved_amount: e.target.value })} className="rounded-xl" data-testid="goal-saved-input" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Deadline (optional)</Label>
                <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="rounded-xl" data-testid="goal-deadline-input" />
              </div>
              <Button type="submit" className="w-full rounded-full bg-moss hover:bg-moss-hover" data-testid="goal-submit-button">Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {goals.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-border">
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Target className="w-10 h-10 text-moss/50" />
            <div className="font-display text-xl">No goals yet</div>
            <p className="text-sm text-muted-foreground max-w-sm">Create your first goal — emergency fund, vacation, down payment — and watch it grow.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="goals-grid">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              g={g}
              settings={settings}
              currency={user?.currency}
              onContribute={contribute}
              onDelete={del}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({ g, settings, currency, onContribute, onDelete }) {
  const [extra, setExtra] = useState(0);

  const pct = Math.min(100, (g.saved_amount / g.target_amount) * 100);
  const baseMonthly = settings ? (settings.monthly_salary * settings.savings_pct) / 100 : 0;
  const remaining = Math.max(0, g.target_amount - g.saved_amount);
  const done = remaining <= 0;
  const baseMonths = !done && baseMonthly > 0 ? Math.ceil(remaining / baseMonthly) : null;
  const projectedMonthly = baseMonthly + extra;
  const projectedMonths = !done && projectedMonthly > 0 ? Math.ceil(remaining / projectedMonthly) : null;
  const saved = baseMonths != null && projectedMonths != null ? baseMonths - projectedMonths : 0;
  const deadlineMonths = g.deadline ? monthsUntil(g.deadline) : null;
  const onTrack = baseMonths != null && deadlineMonths != null ? baseMonths <= deadlineMonths : null;

  return (
    <Card className="rounded-2xl border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" data-testid={`goal-card-${g.id}`}>
      <CardHeader className="flex flex-row justify-between items-start">
        <div>
          <CardTitle className="font-display">{g.name}</CardTitle>
          {g.deadline && <div className="text-xs text-muted-foreground mt-1">By {g.deadline}</div>}
        </div>
        <Button size="icon" variant="ghost" onClick={() => onDelete(g.id)} data-testid={`del-goal-${g.id}`}>
          <Trash2 className="w-4 h-4 text-muted-foreground" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-mono text-moss">{fmtMoney(g.saved_amount, currency)}</span>
            <span className="text-muted-foreground font-mono">{fmtMoney(g.target_amount, currency)}</span>
          </div>
          <Progress value={pct} className="h-2.5 rounded-full" />
          <div className="text-xs text-muted-foreground mt-2">{pct.toFixed(0)}% complete</div>
        </div>

        <EtaChip
          goalId={g.id}
          done={done}
          baseMonthly={baseMonthly}
          baseMonths={baseMonths}
          remaining={remaining}
          deadlineMonths={deadlineMonths}
          onTrack={onTrack}
          currency={currency}
        />

        {!done && baseMonthly > 0 && (
          <div className="rounded-xl border border-dashed border-moss/30 p-4 space-y-3" data-testid={`whatif-${g.id}`}>
            <div className="flex items-center gap-2 text-xs font-medium text-moss">
              <Sparkles className="w-3.5 h-3.5" />
              What if I save more?
            </div>
            <Slider
              value={[extra]}
              onValueChange={(v) => setExtra(v[0])}
              min={0}
              max={100000}
              step={500}
              data-testid={`whatif-slider-${g.id}`}
            />
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">
                +{fmtMoney(extra, currency)}<span className="opacity-60">/mo</span>
              </span>
              <span className="font-mono text-moss" data-testid={`whatif-projected-${g.id}`}>
                {projectedMonths === baseMonths
                  ? etaLabel(baseMonths)
                  : `${etaLabel(projectedMonths)} · save ${saved} mo`}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onContribute(g, 50)} data-testid={`add50-${g.id}`}>+50</Button>
          <Button variant="outline" className="rounded-full" onClick={() => onContribute(g, 100)} data-testid={`add100-${g.id}`}>+100</Button>
          <Button variant="outline" className="rounded-full" onClick={() => onContribute(g, -50)} data-testid={`sub50-${g.id}`}>−50</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EtaChip({ goalId, done, baseMonthly, baseMonths, remaining, deadlineMonths, onTrack, currency }) {
  let body;
  if (done) {
    body = <div className="font-medium text-moss">Goal reached. 🌱</div>;
  } else if (baseMonthly <= 0) {
    body = (
      <>
        <div className="font-medium">Set a salary & savings %</div>
        <div className="text-muted-foreground">to see months-to-goal.</div>
      </>
    );
  } else {
    const deadlineNote =
      deadlineMonths == null
        ? null
        : onTrack
          ? `on track (${deadlineMonths} mo left)`
          : `${baseMonths - deadlineMonths} mo behind deadline`;
    body = (
      <>
        <div className="font-medium" data-testid={`goal-months-${goalId}`}>
          {etaLabel(baseMonths)} at {fmtMoney(baseMonthly, currency)}/mo
        </div>
        <div className="text-muted-foreground">
          {fmtMoney(remaining, currency)} to go
          {deadlineNote && (
            <span className={onTrack ? "text-moss ml-1" : "text-terracotta ml-1"}>
              {" · "}{deadlineNote}
            </span>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="rounded-xl bg-sage border border-border p-3 flex items-center gap-3" data-testid={`goal-eta-${goalId}`}>
      <div className="w-8 h-8 rounded-full bg-moss/10 flex items-center justify-center shrink-0">
        <CalendarClock className="w-4 h-4 text-moss" />
      </div>
      <div className="text-xs leading-tight">{body}</div>
    </div>
  );
}

function etaLabel(months) {
  if (months <= 1) return "≈ 1 month to go";
  if (months < 12) return `≈ ${months} months to go`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (m === 0) return `≈ ${y} ${y === 1 ? "year" : "years"} to go`;
  return `≈ ${y}y ${m}m to go`;
}

function monthsUntil(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const now = new Date();
  const diff = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  return Math.max(0, diff);
}
