import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Goals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", target_amount: "", saved_amount: 0, deadline: "" });

  const load = async () => {
    const { data } = await api.get("/goals");
    setGoals(data);
  };
  useEffect(() => { load(); }, []);

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
            <DialogHeader><DialogTitle className="font-display">New goal</DialogTitle></DialogHeader>
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
          {goals.map((g) => {
            const pct = Math.min(100, (g.saved_amount / g.target_amount) * 100);
            return (
              <Card key={g.id} className="rounded-2xl border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" data-testid={`goal-card-${g.id}`}>
                <CardHeader className="flex flex-row justify-between items-start">
                  <div>
                    <CardTitle className="font-display">{g.name}</CardTitle>
                    {g.deadline && <div className="text-xs text-muted-foreground mt-1">By {g.deadline}</div>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => del(g.id)} data-testid={`del-goal-${g.id}`}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-mono text-moss">{fmtMoney(g.saved_amount, user?.currency)}</span>
                      <span className="text-muted-foreground font-mono">{fmtMoney(g.target_amount, user?.currency)}</span>
                    </div>
                    <Progress value={pct} className="h-2.5 rounded-full" />
                    <div className="text-xs text-muted-foreground mt-2">{pct.toFixed(0)}% complete</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="rounded-full" onClick={() => contribute(g, 50)} data-testid={`add50-${g.id}`}>+50</Button>
                    <Button variant="outline" className="rounded-full" onClick={() => contribute(g, 100)} data-testid={`add100-${g.id}`}>+100</Button>
                    <Button variant="outline" className="rounded-full" onClick={() => contribute(g, -50)} data-testid={`sub50-${g.id}`}>−50</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
