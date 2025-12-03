import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-provider";
import { ChevronRight, Home, User, LogOut, Settings } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ExpiredPlanBlocker } from "@/components/expired-plan-blocker";

interface AdminUser {
  name: string;
  email: string;
  role: string;
  accessExpiresAt: string | null;
  planoId: string | null;
}

interface AdminLayoutProps {
  children: React.ReactNode;
  token: string | null;
  onLogout: () => void;
}

function Breadcrumbs() {
  const [location] = useLocation();
  
  const segments = location.split("/").filter(Boolean);
  
  const breadcrumbMap: Record<string, string> = {
    admin: "Dashboard",
    webinars: "Webinários",
    videos: "Vídeos",
    users: "Usuários",
    settings: "Configurações",
  };
  
  if (segments.length <= 1) return null;
  
  return (
    <nav className="hidden sm:flex items-center gap-1 text-sm">
      <Link href="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
        <Home className="w-4 h-4" />
      </Link>
      {segments.slice(1).map((segment, index) => {
        const path = "/" + segments.slice(0, index + 2).join("/");
        const isLast = index === segments.length - 2;
        const label = breadcrumbMap[segment] || segment;
        
        return (
          <div key={path} className="flex items-center gap-1">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            {isLast ? (
              <span className="font-medium truncate max-w-32">{label}</span>
            ) : (
              <Link href={path} className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-32">
                {label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function AdminLayout({ children, token, onLogout }: AdminLayoutProps) {
  const [location, setLocation] = useLocation();
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    if (token) {
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setUser(data))
        .catch(() => setUser(null));
    }
  }, [token]);

  const isExpired = user?.accessExpiresAt && new Date(user.accessExpiresAt) < new Date();
  const isTrial = user?.planoId === "trial";
  
  const allowedPagesWhenExpired = ["/admin/subscription", "/checkout"];
  const isOnAllowedPage = allowedPagesWhenExpired.some(page => location.startsWith(page));
  
  if (isExpired && !isOnAllowedPage && user) {
    return (
      <ExpiredPlanBlocker 
        userName={user.name}
        expirationDate={user.accessExpiresAt!}
        isTrial={isTrial}
        onLogout={() => {
          onLogout();
          setLocation("/login");
        }}
      />
    );
  }

  const handleLogout = () => {
    onLogout();
    setLocation("/login");
  };

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar onLogout={handleLogout} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-2 sm:gap-3 h-14 px-3 sm:px-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <Separator orientation="vertical" className="h-5 hidden sm:block" />
              <Breadcrumbs />
              <span className="text-sm text-muted-foreground sm:hidden">Admin</span>
            </div>
            
            <div className="flex items-center gap-2">
              <ThemeToggle />
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full" data-testid="button-profile-menu">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {user?.name ? getInitials(user.name) : <User className="w-4 h-4" />}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.name || "Usuário"}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                      {user?.role && (
                        <p className="text-xs text-primary capitalize">{user.role}</p>
                      )}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/admin/settings" className="flex items-center cursor-pointer" data-testid="link-settings">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Configurações</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer" data-testid="button-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sair</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
