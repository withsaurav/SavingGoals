import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, Receipt, PieChart, Target, Leaf, LogOut, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { brand } from "@/brand.config";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/transactions", label: "Transactions", icon: Receipt, testid: "nav-transactions" },
  { to: "/budget", label: "Budget", icon: PieChart, testid: "nav-budget" },
  { to: "/goals", label: "Goals", icon: Target, testid: "nav-goals" },
  { to: "/history", label: "History", icon: History, testid: "nav-history" },
  { to: "/advisor", label: "Sage AI", icon: Leaf, testid: "nav-advisor" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <aside className="md:w-64 md:min-h-screen border-r border-border bg-white px-6 py-8 flex flex-col">
        <div className="flex items-center gap-2 mb-10">
          <BrandMark size="md" />
          <div>
            <div className="font-display font-bold text-lg leading-none">{brand.name}</div>
            <div className="text-xs text-muted-foreground">{brand.tagline}</div>
          </div>
        </div>

        <nav className="flex md:flex-col gap-1 flex-wrap">
          {links.map(({ to, label, icon: Icon, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-testid={testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                  isActive
                    ? "bg-moss text-white shadow-sm"
                    : "text-muted-foreground hover:bg-sage hover:text-foreground"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-8 hidden md:block">
          <div className="rounded-2xl bg-sage p-4 border border-border">
            <div className="text-xs text-muted-foreground">Signed in as</div>
            <div className="font-medium text-sm truncate" data-testid="layout-user-email">{user?.email}</div>
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="mt-3 w-full rounded-full"
              data-testid="logout-button"
            >
              <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 px-6 md:px-12 py-8 md:py-12 max-w-7xl">
        <Outlet />
      </main>
    </div>
  );
}
