import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMarkOnDark } from "@/components/BrandMark";
import { brand } from "@/brand.config";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate("/");
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
            {brand.heroHeadline}
          </h1>
          <p className="text-white/70 text-base max-w-md">
            {brand.heroSubtitle}
          </p>
        </div>
        <div className="text-xs text-white/50">{brand.copyright}</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6" data-testid="login-form">
          <div>
            <h2 className="font-display text-3xl font-bold">Welcome back</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Sign in to your budget.
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
              data-testid="login-email-input"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                to="/forgot-password"
                className="text-xs text-moss hover:underline underline-offset-4"
                data-testid="forgot-password-link"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl"
              data-testid="login-password-input"
            />
          </div>

          {error && (
            <div className="text-sm text-destructive" data-testid="login-error">{error}</div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-moss hover:bg-moss-hover h-11"
            data-testid="login-submit-button"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </Button>

          <div className="text-sm text-muted-foreground text-center">
            No account?{" "}
            <Link to="/register" className="text-moss font-medium underline-offset-4 hover:underline" data-testid="link-to-register">
              Create one
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
