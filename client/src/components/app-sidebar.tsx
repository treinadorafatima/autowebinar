import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { 
  Gauge, 
  Radio, 
  Film, 
  ScrollText, 
  MessageSquareText, 
  AudioLines,
  Send,
  LogOut,
  Sparkles,
  Settings,
  Users,
  Brain,
  Wallet,
  Package,
  TrendingUp,
  Shield,
  Zap,
  UserCheck,
  Bell,
  Mail,
  Bot,
  Globe
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
    title: "Painel",
    url: "/admin",
    icon: Gauge,
    superadminOnly: false,
  },
  {
    title: "Webinários",
    url: "/admin/webinars",
    icon: Radio,
    superadminOnly: false,
  },
  {
    title: "Vídeos",
    url: "/admin/videos",
    icon: Film,
    superadminOnly: false,
  },
  {
    title: "Roteirizador",
    url: "/admin/scripts",
    icon: ScrollText,
    superadminOnly: false,
  },
  {
    title: "Gerador de Mensagens",
    url: "/admin/messages",
    icon: MessageSquareText,
    superadminOnly: false,
  },
  {
    title: "Transcrever Vídeo",
    url: "/admin/transcription",
    icon: AudioLines,
    superadminOnly: false,
  },
  {
    title: "Campanhas E-mail",
    url: "/admin/email-marketing",
    icon: Send,
    superadminOnly: false,
  },
  {
    title: "WhatsApp Marketing",
    url: "/admin/whatsapp-marketing",
    icon: SiWhatsapp,
    superadminOnly: false,
  },
  {
    title: "Agentes de IA",
    url: "/admin/ai-agents",
    icon: Bot,
    superadminOnly: false,
  },
  {
    title: "Leads",
    url: "/admin/leads",
    icon: UserCheck,
    superadminOnly: false,
  },
];

const accountMenuItems = [
  {
    title: "Plano & Cobrança",
    url: "/admin/subscription",
    icon: Wallet,
    superadminOnly: false,
  },
  {
    title: "Segurança",
    url: "/admin/change-password",
    icon: Shield,
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
    title: "Config. Plataforma",
    url: "/admin/platform-settings",
    icon: Globe,
    superadminOnly: true,
  },
  {
    title: "Afiliados",
    url: "/admin/affiliates",
    icon: Zap,
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
    icon: Wallet,
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
    icon: TrendingUp,
    superadminOnly: true,
  },
  {
    title: "Notificações WhatsApp",
    url: "/admin/whatsapp-notifications",
    icon: Bell,
    superadminOnly: true,
  },
  {
    title: "Notificações E-mail",
    url: "/admin/email-notifications",
    icon: Mail,
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
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
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

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/admin/webinars?new=1" data-testid="link-sidebar-new-webinar">
                    <Sparkles className="w-4 h-4" />
                    <span>Criar Transmissão</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Conta</SidebarGroupLabel>
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
