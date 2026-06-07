import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMarkOnDark } from "@/components/BrandMark";
import { brand } from "@/brand.config";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [verifying, setVerifying] = useState(true);
  const [valid, setValid] = useState(false);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setReason("Missing reset token in the URL.");
      return;
    }
    (async () => {
      try {
        const { data } = await api.post("/auth/verify-reset-token", { token });
        setValid(!!data.valid);
        if (data.valid) setEmail(data.email);
        else setReason(data.reason || "Invalid or expired token");
      } catch (err) {
        setReason(formatApiError(err.response?.data?.detail) || err.message);
      } finally {
        setVerifying(false);
      }
    })();
  }, [token]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (pw.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (pw !== pw2) { setError("Passwords don't match."); return; }
    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pw });
      setDone(true);
      toast.success("Password updated");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between bg-moss text-white p-12">
        <div className="flex items-center gap-2">
          <BrandMarkOnDark />
          <span className="font-display font-bold text-xl">{brand.name}</span>
        </div>
        <div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold mb-4 text-balance">
            One last step.
          </h1>
          <p className="text-white/70 text-base max-w-md">
            Pick a fresh password and you'll be back to budgeting in seconds.
          </p>
        </div>
        <div className="text-xs text-white/50">{brand.copyright}</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          {verifying && (
            <div className="text-muted-foreground" data-testid="reset-verifying">Verifying link…</div>
          )}

          {!verifying && !valid && (
            <div className="space-y-5" data-testid="reset-invalid">
              <div className="rounded-2xl bg-destructive/5 border border-destructive/30 p-6 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <div className="font-display text-lg font-bold">Reset link unavailable</div>
                  <p className="text-sm text-muted-foreground mt-1">{reason}</p>
                </div>
              </div>
              <Link to="/forgot-password">
                <Button className="w-full rounded-full bg-moss hover:bg-moss-hover" data-testid="request-new-link-btn">
                  Request a new link
                </Button>
              </Link>
            </div>
          )}

          {!verifying && valid && !done && (
            <form onSubmit={onSubmit} className="space-y-5" data-testid="reset-form">
              <div>
                <h2 className="font-display text-3xl font-bold">Set a new password</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  For <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw">New password</Label>
                <Input id="pw" type="password" required minLength={6} value={pw}
                  onChange={(e) => setPw(e.target.value)} className="rounded-xl" data-testid="reset-pw-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirm password</Label>
                <Input id="pw2" type="password" required minLength={6} value={pw2}
                  onChange={(e) => setPw2(e.target.value)} className="rounded-xl" data-testid="reset-pw2-input" />
              </div>
              {error && <div className="text-sm text-destructive" data-testid="reset-error">{error}</div>}
              <Button type="submit" disabled={submitting} className="w-full rounded-full bg-moss hover:bg-moss-hover h-11" data-testid="reset-submit-button">
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}

          {done && (
            <div className="rounded-2xl bg-sage border border-border p-6 flex items-start gap-3" data-testid="reset-done">
              <div className="w-10 h-10 rounded-full bg-moss flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-display text-lg font-bold">Password updated</div>
                <p className="text-sm text-muted-foreground mt-1">Redirecting you to sign in…</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
