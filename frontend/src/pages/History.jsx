import { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Archive, ArrowDownRight, ArrowUpRight, RotateCcw, Wallet } from "lucide-react";
import { toast } from "sonner";

export default function History() {
  const { user } = useAuth();
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [confirmReopen, setConfirmReopen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/months/archives");
      setArchives(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (month) => {
    try {
      const { data } = await api.get(`/months/archives/${month}`);
      setDetail(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const reopen = async (month) => {
    try {
      const { data } = await api.delete(`/months/archives/${month}`);
      toast.success(`Reopened ${month} — restored ${data.restored} transactions`);
      setConfirmReopen(null);
      setDetail(null);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-8 animate-fade-up">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">Past months</h1>
        <p className="text-muted-foreground text-sm">
          A clean ledger of every closed month. Goals carry forward independently.
        </p>
      </header>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : archives.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-border">
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Archive className="w-10 h-10 text-moss/50" />
            <div className="font-display text-xl">No closed months yet</div>
            <p className="text-sm text-muted-foreground max-w-sm">
              When you click <em>End of month</em> on the Dashboard, this month's data is saved here
              and the new month starts with a clean slate.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="archives-grid">
          {archives.map((a) => (
            <Card
              key={a.id}
              className="rounded-2xl border-border cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              onClick={() => openDetail(a.month)}
              data-testid={`archive-card-${a.month}`}
            >
              <CardHeader>
                <CardTitle className="font-display flex items-center justify-between">
                  <span className="font-mono text-base">{a.month}</span>
                  <span className={a.net >= 0 ? "text-moss text-sm" : "text-terracotta text-sm"}>
                    {a.net >= 0 ? "+" : ""}{fmtMoney(a.net, a.currency)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row icon={Wallet} label="Salary" value={fmtMoney(a.monthly_salary, a.currency)} />
                <Row icon={ArrowDownRight} label="Income" value={fmtMoney(a.income, a.currency)} />
                <Row icon={ArrowUpRight} label="Expenses" value={fmtMoney(a.expenses, a.currency)} />
                <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                  {a.tx_count} transactions · closed {a.closed_at.slice(0, 10)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="rounded-2xl max-w-2xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">{detail.month}</DialogTitle>
                <DialogDescription>
                  Closed on {detail.closed_at.slice(0, 10)} · {detail.tx_count} transactions
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-3 my-4">
                <Stat label="Salary" value={fmtMoney(detail.monthly_salary, detail.currency)} />
                <Stat label="Expenses" value={fmtMoney(detail.expenses, detail.currency)} tone="terracotta" />
                <Stat label="Net" value={fmtMoney(detail.net, detail.currency)} tone={detail.net >= 0 ? "moss" : "terracotta"} />
              </div>

              <div className="space-y-1 text-sm">
                <div className="font-medium mb-2">By bucket</div>
                {Object.entries(detail.by_bucket).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1 border-b border-border last:border-0">
                    <span className="capitalize">{k}</span>
                    <span className="font-mono">{fmtMoney(v, detail.currency)}</span>
                  </div>
                ))}
              </div>

              {Object.keys(detail.by_category || {}).length > 0 && (
                <div className="space-y-1 text-sm mt-4">
                  <div className="font-medium mb-2">By category</div>
                  {Object.entries(detail.by_category).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1 border-b border-border last:border-0">
                      <span>{k}</span>
                      <span className="font-mono">{fmtMoney(v, detail.currency)}</span>
                    </div>
                  ))}
                </div>
              )}

              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setConfirmReopen(detail.month)}
                  data-testid={`reopen-${detail.month}`}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-2" />
                  Reopen month
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmReopen} onOpenChange={(o) => !o && setConfirmReopen(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Reopen {confirmReopen}?</DialogTitle>
            <DialogDescription>
              The archive will be removed and all transactions will be restored to your active list.
              Goals are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmReopen(null)}>Cancel</Button>
            <Button
              className="bg-moss hover:bg-moss-hover rounded-full"
              onClick={() => reopen(confirmReopen)}
              data-testid="confirm-reopen-btn"
            >
              Yes, reopen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" /> {label}
      </span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const cls = tone === "terracotta" ? "text-terracotta" : tone === "moss" ? "text-moss" : "";
  return (
    <div className="rounded-xl bg-sage p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-display text-lg font-bold ${cls}`}>{value}</div>
    </div>
  );
}
