import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AdminLayout } from "@/components/admin-layout";
import WebinarPublicPage from "@/pages/webinar-public";
import WebinarReplayPage from "@/pages/webinar-replay";
import Aula1Page from "@/pages/aula-1";
import CarlosPage from "@/pages/carlos";
import CarlosReplayPage from "@/pages/carlos-replay";
import LoginPage from "@/pages/login";
import AdminPage from "@/pages/admin";
import AdminUsersPage from "@/pages/admin-users";
import AdminWebinarsPage from "@/pages/admin-webinars";
import AdminWebinarDetailPage from "@/pages/admin-webinar-detail";
import AdminVideosPage from "@/pages/admin-videos";
import AdminSettingsPage from "@/pages/admin-settings";
import ScriptCreatorPage from "@/pages/script-creator";
import MessageGeneratorPage from "@/pages/message-generator";
import TranscriptionPage from "@/pages/transcription";
import AdminAiConfigPage from "@/pages/admin-ai-config";
import AdminCheckoutConfigPage from "@/pages/admin-checkout-config";
import AdminCheckoutPlanosPage from "@/pages/admin-checkout-planos";
import AdminCheckoutRelatoriosPage from "@/pages/admin-checkout-relatorios";
import AdminSubscriptionPage from "@/pages/admin-subscription";
import AdminChangePasswordPage from "@/pages/admin-change-password";
import CheckoutPage from "@/pages/checkout";
import PagamentoResultado from "@/pages/pagamento-resultado";
import LandingPage from "@/pages/landing";
import WebinarModeratorPage from "@/pages/webinar-moderator";
import WebinarRegisterPage from "@/pages/webinar-register";
import VideoEmbedPage from "@/pages/video-embed";
import FreeTrialPage from "@/pages/free-trial";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import AdminEmailMarketingPage from "@/pages/admin-email-marketing";
import AdminWhatsAppMarketingPage from "@/pages/admin-whatsapp-marketing";
import AdminLeadsPage from "@/pages/admin-leads";
import AdminUpgradePage from "@/pages/admin-upgrade";
import AdminAffiliatesPage from "@/pages/admin-affiliates";
import AdminWhatsAppNotificationsPage from "@/pages/admin-whatsapp-notifications";
import AdminEmailNotificationsPage from "@/pages/admin-email-notifications";
import AdminAiAgentsPage from "@/pages/admin-ai-agents";
import ClientCalendarConnectPage from "@/pages/client-calendar-connect";
import AfiliadoCadastroPage from "@/pages/afiliado-cadastro";
import AfiliadoLoginPage from "@/pages/afiliado-login";
import AfiliadoDashboardPage from "@/pages/afiliado-dashboard";
import AfiliadoForgotPasswordPage from "@/pages/afiliado-forgot-password";
import AfiliadoResetPasswordPage from "@/pages/afiliado-reset-password";
import AffiliateRedirectPage from "@/pages/affiliate-redirect";
import PoliticaPrivacidadePage from "@/pages/politica-privacidade";
import TermosServicoPage from "@/pages/termos-servico";
import NotFound from "@/pages/not-found";

function HomePage() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function findFirstWebinar() {
      try {
        const res = await fetch("/api/webinars/public");
        if (res.ok) {
          const webinars = await res.json();
          if (webinars.length > 0) {
            setLocation(`/w/${webinars[0].slug}`);
            return;
          }
        }
      } catch (e) {
        console.error("Erro ao buscar webinários:", e);
      }
      setLocation("/login");
    }
    findFirstWebinar();
  }, [setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }
  
  return null;
}

function AdminRoutes() {
  const [token, setToken] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const savedToken = localStorage.getItem("adminToken");
    if (savedToken) {
      setToken(savedToken);
    } else {
      setLocation("/login");
    }
  }, [setLocation]);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    setToken(null);
  };

  if (!token) {
    return null;
  }

  return (
    <AdminLayout token={token} onLogout={handleLogout}>
      <Switch>
        <Route path="/admin" component={AdminPage} />
        <Route path="/admin/users" component={AdminUsersPage} />
        <Route path="/admin/webinars" component={AdminWebinarsPage} />
        <Route path="/admin/webinars/:id" component={AdminWebinarDetailPage} />
        <Route path="/admin/videos" component={AdminVideosPage} />
        <Route path="/admin/settings" component={AdminSettingsPage} />
        <Route path="/admin/ai-config" component={AdminAiConfigPage} />
        <Route path="/admin/scripts" component={ScriptCreatorPage} />
        <Route path="/admin/messages" component={MessageGeneratorPage} />
        <Route path="/admin/transcription" component={TranscriptionPage} />
        <Route path="/admin/checkout/config" component={AdminCheckoutConfigPage} />
        <Route path="/admin/checkout/planos" component={AdminCheckoutPlanosPage} />
        <Route path="/admin/checkout/relatorios" component={AdminCheckoutRelatoriosPage} />
        <Route path="/admin/subscription" component={AdminSubscriptionPage} />
        <Route path="/admin/change-password" component={AdminChangePasswordPage} />
        <Route path="/admin/email-marketing" component={AdminEmailMarketingPage} />
        <Route path="/admin/whatsapp-marketing" component={AdminWhatsAppMarketingPage} />
        <Route path="/admin/leads" component={AdminLeadsPage} />
        <Route path="/admin/upgrade" component={AdminUpgradePage} />
        <Route path="/admin/affiliates" component={AdminAffiliatesPage} />
        <Route path="/admin/whatsapp-notifications" component={AdminWhatsAppNotificationsPage} />
        <Route path="/admin/email-notifications" component={AdminEmailNotificationsPage} />
        <Route path="/admin/ai-agents" component={AdminAiAgentsPage} />
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}

function Router() {
  const [location] = useLocation();

  if (location.startsWith("/admin")) {
    return <AdminRoutes />;
  }

  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/admin-login" component={LoginPage} />
      <Route path="/teste-gratis" component={FreeTrialPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/aula-1" component={Aula1Page} />
      <Route path="/carlos" component={CarlosPage} />
      <Route path="/carlos/replay" component={CarlosReplayPage} />
      <Route path="/calendar/connect" component={ClientCalendarConnectPage} />
      <Route path="/w/:slug" component={WebinarPublicPage} />
      <Route path="/w/:slug/register" component={WebinarRegisterPage} />
      <Route path="/w/:slug/replay" component={WebinarReplayPage} />
      <Route path="/w/:slug/moderate" component={WebinarModeratorPage} />
      <Route path="/embed/video/:videoId" component={VideoEmbedPage} />
      <Route path="/checkout" component={CheckoutPage} />
      <Route path="/checkout/:planoId" component={CheckoutPage} />
      <Route path="/pagamento/sucesso">{() => <PagamentoResultado tipo="sucesso" />}</Route>
      <Route path="/pagamento/pendente">{() => <PagamentoResultado tipo="pendente" />}</Route>
      <Route path="/pagamento/erro">{() => <PagamentoResultado tipo="erro" />}</Route>
      <Route path="/afiliado/cadastro" component={AfiliadoCadastroPage} />
      <Route path="/afiliado/login" component={AfiliadoLoginPage} />
      <Route path="/afiliado/dashboard" component={AfiliadoDashboardPage} />
      <Route path="/afiliado/forgot-password" component={AfiliadoForgotPasswordPage} />
      <Route path="/afiliado/reset-password" component={AfiliadoResetPasswordPage} />
      <Route path="/r/:code" component={AffiliateRedirectPage} />
      <Route path="/politica-de-privacidade" component={PoliticaPrivacidadePage} />
      <Route path="/termos-de-servico" component={TermosServicoPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
