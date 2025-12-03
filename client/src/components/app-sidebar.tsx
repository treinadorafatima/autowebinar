import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  Video, 
  Zap, 
  LogOut,
  Plus,
  Play,
  Settings,
  Users,
  BookOpen,
  Mail,
  MailCheck,
  Brain,
  CreditCard,
  Package,
  BarChart3,
  UserCircle,
  KeyRound,
  User,
  Mic
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import logoUrl from "@assets/logo-autowebinar-preto.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

interface AppSidebarProps {
  onLogout: () => void;
}

const mainMenuItems = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: LayoutDashboard,
    superadminOnly: false,
  },
  {
    title: "Webinários",
    url: "/admin/webinars",
    icon: Play,
    superadminOnly: false,
  },
  {
    title: "Vídeos",
    url: "/admin/videos",
    icon: Video,
    superadminOnly: false,
  },
  {
    title: "Roteiros",
    url: "/admin/scripts",
    icon: BookOpen,
    superadminOnly: false,
  },
  {
    title: "Mensagens",
    url: "/admin/messages",
    icon: Mail,
    superadminOnly: false,
  },
  {
    title: "Transcrição",
    url: "/admin/transcription",
    icon: Mic,
    superadminOnly: false,
  },
  {
    title: "Email Marketing",
    url: "/admin/email-marketing",
    icon: MailCheck,
    superadminOnly: false,
  },
  {
    title: "WhatsApp",
    url: "/admin/whatsapp-marketing",
    icon: SiWhatsapp,
    superadminOnly: false,
  },
];

const accountMenuItems = [
  {
    title: "Minha Assinatura",
    url: "/admin/subscription",
    icon: CreditCard,
    superadminOnly: false,
  },
  {
    title: "Trocar Senha",
    url: "/admin/change-password",
    icon: KeyRound,
    superadminOnly: false,
  },
];

const adminMenuItems = [
  {
    title: "Usuários",
    url: "/admin/users",
    icon: Users,
    superadminOnly: true,
  },
  {
    title: "Configurações IA",
    url: "/admin/settings",
    icon: Settings,
    superadminOnly: true,
  },
  {
    title: "Prompt IA",
    url: "/admin/ai-config",
    icon: Brain,
    superadminOnly: true,
  },
  {
    title: "Gateways",
    url: "/admin/checkout/config",
    icon: CreditCard,
    superadminOnly: true,
  },
  {
    title: "Planos",
    url: "/admin/checkout/planos",
    icon: Package,
    superadminOnly: true,
  },
  {
    title: "Vendas",
    url: "/admin/checkout/relatorios",
    icon: BarChart3,
    superadminOnly: true,
  },
];

export function AppSidebar({ onLogout }: AppSidebarProps) {
  const [location] = useLocation();
  const [userRole, setUserRole] = useState<string>("user");

  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    if (token) {
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setUserRole(data.role || "user"))
        .catch(() => setUserRole("user"));
    }
  }, []);

  const isSuperadmin = userRole === "superadmin";

  const isActive = (url: string) => {
    if (url === "/admin") {
      return location === "/admin";
    }
    return location.startsWith(url);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-3 border-b border-sidebar-border flex items-center justify-center">
        <Link href="/admin" className="flex items-center gap-2">
          <img 
            src={logoUrl}
            alt="AutoWebinar" 
            className="h-10 w-auto object-contain" 
            data-testid="img-sidebar-logo"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive(item.url)}
                  >
                    <Link href={item.url} data-testid={`link-sidebar-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Minha Conta</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive(item.url)}
                  >
                    <Link href={item.url} data-testid={`link-sidebar-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isSuperadmin && (
          <>
            <SidebarSeparator />

            <SidebarGroup>
              <SidebarGroupLabel>Administração</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminMenuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild 
                        isActive={isActive(item.url)}
                      >
                        <Link href={item.url} data-testid={`link-sidebar-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Ações Rápidas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/admin/webinars?new=1" data-testid="link-sidebar-new-webinar">
                    <Plus className="w-4 h-4" />
                    <span>Novo Webinário</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <Button 
          variant="ghost" 
          className="w-full justify-start"
          onClick={onLogout}
          data-testid="button-sidebar-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
