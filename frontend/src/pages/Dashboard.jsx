import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney, currentMonth } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowDownRight, ArrowUpRight, Wallet, TrendingUp, Leaf } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const BUCKET_COLORS = { needs: "#2C4C3B", wants: "#C86A53", savings: "#D9984A" };

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/dashboard");
    setData(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="text-muted-foreground">Loading…</div>;

  const cur = data.currency;
  const bucketData = Object.entries(data.by_bucket).map(([k, v]) => ({ name: k, value: v, color: BUCKET_COLORS[k] }));
  const categoryData = Object.entries(data.by_category).map(([k, v]) => ({ name: k, amount: v }));

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-sm text-muted-foreground">Welcome back, {user?.name}</div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">Your money this month</h1>
        </div>
        <div className="text-sm font-mono text-muted-foreground">{data.month}</div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard testid="stat-salary" icon={Wallet} label="Salary" value={fmtMoney(data.monthly_salary, cur)} tone="moss" />
        <StatCard testid="stat-income" icon={ArrowDownRight} label="Extra income" value={fmtMoney(data.income, cur)} tone="success" />
        <StatCard testid="stat-expenses" icon={ArrowUpRight} label="Expenses" value={fmtMoney(data.expenses, cur)} tone="terracotta" />
        <StatCard testid="stat-net" icon={TrendingUp} label="Net this month" value={fmtMoney(data.net, cur)} tone={data.net >= 0 ? "success" : "terracotta"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="rounded-2xl lg:col-span-2 border-border">
          <CardHeader>
            <CardTitle className="font-display">50 · 30 · 20 progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {["needs", "wants", "savings"].map((b) => {
              const spent = data.by_bucket[b] || 0;
              const budget = data.budgets[b] || 0;
              const pct = budget ? Math.min(100, (spent / budget) * 100) : 0;
              return (
                <div key={b} data-testid={`bucket-${b}`}>
                  <div className="flex justify-between mb-2 text-sm">
                    <span className="capitalize font-medium" style={{ color: BUCKET_COLORS[b] }}>{b}</span>
                    <span className="text-muted-foreground">
                      {fmtMoney(spent, cur)} <span className="opacity-60">/ {fmtMoney(budget, cur)}</span>
                    </span>
                  </div>
                  <Progress value={pct} className="h-2.5 rounded-full" style={{ "--progress-fg": BUCKET_COLORS[b] }} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border">
          <CardHeader>
            <CardTitle className="font-display">Where money went</CardTitle>
          </CardHeader>
          <CardContent>
            {bucketData.every((d) => d.value === 0) ? (
              <div className="text-sm text-muted-foreground py-12 text-center flex flex-col items-center gap-3">
                <Leaf className="w-8 h-8 text-moss/40" />
                Add expenses to see the breakdown
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={bucketData} dataKey="value" innerRadius={50} outerRadius={85} paddingAngle={4}>
                    {bucketData.map((e) => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtMoney(v, cur)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {categoryData.length > 0 && (
        <Card className="rounded-2xl border-border">
          <CardHeader><CardTitle className="font-display">Spending by category</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E8E5" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => fmtMoney(v, cur)} />
                <Bar dataKey="amount" fill="#2C4C3B" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-border">
        <CardHeader><CardTitle className="font-display">Recent activity</CardTitle></CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6">No transactions yet this month.</div>
          ) : (
            <ul className="divide-y divide-border" data-testid="recent-list">
              {data.recent.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{t.category}</div>
                    <div className="text-xs text-muted-foreground">{t.note || t.bucket} · {t.date}</div>
                  </div>
                  <div className={t.type === "expense" ? "text-terracotta font-mono" : "text-moss font-mono"}>
                    {t.type === "expense" ? "−" : "+"}{fmtMoney(t.amount, cur)}
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

function StatCard({ icon: Icon, label, value, tone, testid }) {
  const toneCls = {
    moss: "bg-moss text-white",
    success: "bg-moss-light text-white",
    terracotta: "bg-terracotta text-white",
    ochre: "bg-ochre text-white",
  }[tone] || "bg-moss text-white";
  return (
    <Card className="rounded-2xl border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" data-testid={testid}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${toneCls}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-display text-3xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
