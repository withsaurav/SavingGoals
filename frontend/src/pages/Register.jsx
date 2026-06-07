import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrandMarkOnDark } from "@/components/BrandMark";
import { brand } from "@/brand.config";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "BRL"];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", currency: "USD", monthly_salary: 5000 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await register({ ...form, monthly_salary: Number(form.monthly_salary) });
      toast.success("Welcome to Verdant");
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
            {brand.registerHeadline}
          </h1>
          <p className="text-white/70 text-base max-w-md">
            {brand.registerSubtitle}
          </p>
        </div>
        <div className="text-xs text-white/50">{brand.copyright}</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5" data-testid="register-form">
          <div>
            <h2 className="font-display text-3xl font-bold">Create your space</h2>
            <p className="text-muted-foreground text-sm mt-1">It takes 30 seconds.</p>
          </div>

          <div className="space-y-2">
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => onChange("name", e.target.value)} className="rounded-xl" data-testid="register-name-input" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" required value={form.email} onChange={(e) => onChange("email", e.target.value)} className="rounded-xl" data-testid="register-email-input" />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" required minLength={6} value={form.password} onChange={(e) => onChange("password", e.target.value)} className="rounded-xl" data-testid="register-password-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => onChange("currency", v)}>
                <SelectTrigger className="rounded-xl" data-testid="register-currency-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Monthly salary</Label>
              <Input type="number" min="0" step="0.01" value={form.monthly_salary} onChange={(e) => onChange("monthly_salary", e.target.value)} className="rounded-xl" data-testid="register-salary-input" />
            </div>
          </div>

          {error && <div className="text-sm text-destructive" data-testid="register-error">{error}</div>}

          <Button type="submit" disabled={submitting} className="w-full rounded-full bg-moss hover:bg-moss-hover h-11" data-testid="register-submit-button">
            {submitting ? "Creating…" : "Create account"}
          </Button>

          <div className="text-sm text-muted-foreground text-center">
            Already have one?{" "}
            <Link to="/login" className="text-moss font-medium underline-offset-4 hover:underline" data-testid="link-to-login">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
