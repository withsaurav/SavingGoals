import { useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMarkOnDark } from "@/components/BrandMark";
import { brand } from "@/brand.config";
import { ArrowLeft, MailCheck } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setResult(data);
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
            Forgot your password? It happens.
          </h1>
          <p className="text-white/70 text-base max-w-md">
            Enter the email on your account and we'll send you a link to set a new password.
          </p>
        </div>
        <div className="text-xs text-white/50">{brand.copyright}</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <Link to="/login" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground" data-testid="back-to-login">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to sign in
          </Link>

          {!result ? (
            <form onSubmit={onSubmit} className="space-y-6" data-testid="forgot-form">
              <div>
                <h2 className="font-display text-3xl font-bold">Reset your password</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  We'll send a reset link to your inbox.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl"
                  data-testid="forgot-email-input"
                />
              </div>

              {error && (
                <div className="text-sm text-destructive" data-testid="forgot-error">{error}</div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-moss hover:bg-moss-hover h-11"
                data-testid="forgot-submit-button"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          ) : (
            <div className="space-y-5" data-testid="forgot-success">
              <div className="rounded-2xl bg-sage border border-border p-6 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-moss flex items-center justify-center shrink-0">
                  <MailCheck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-display text-lg font-bold">Check your email</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {result.message}
                  </p>
                </div>
              </div>

              {result.dev_reset_url && (
                <div
                  className="rounded-xl border border-dashed border-ochre/50 bg-ochre/5 p-4 text-xs space-y-2"
                  data-testid="dev-reset-banner"
                >
                  <div className="font-medium text-ochre uppercase tracking-wider">
                    Dev mode — no email provider connected
                  </div>
                  <p className="text-muted-foreground">
                    Open this link to reset your password (in production this is emailed automatically):
                  </p>
                  <Link
                    to={`/reset-password?token=${new URL(result.dev_reset_url).searchParams.get("token")}`}
                    className="text-moss underline-offset-4 underline break-all font-mono text-[11px]"
                    data-testid="dev-reset-link"
                  >
                    {result.dev_reset_url}
                  </Link>
                </div>
              )}

              <Button
                onClick={() => { setResult(null); setEmail(""); }}
                variant="outline"
                className="w-full rounded-full"
                data-testid="forgot-send-another"
              >
                Send another
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
