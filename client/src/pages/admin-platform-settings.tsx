import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Globe, 
  Calendar, 
  CheckCircle2, 
  Loader2, 
  Shield,
  ExternalLink
} from "lucide-react";

interface GoogleOAuthConfig {
  configured: boolean;
  clientId?: string;
  clientSecretMasked?: string;
}

export default function AdminPlatformSettings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const token = localStorage.getItem("adminToken");

  const [loadingGoogleOAuth, setLoadingGoogleOAuth] = useState(false);
  const [savingGoogleOAuth, setSavingGoogleOAuth] = useState(false);
  const [googleOAuthConfig, setGoogleOAuthConfig] = useState<GoogleOAuthConfig | null>(null);
  const [showGoogleOAuthModal, setShowGoogleOAuthModal] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    fetchGoogleOAuthConfig();
  }, []);

  async function fetchGoogleOAuthConfig() {
    setLoadingGoogleOAuth(true);
    try {
      const res = await fetch("/api/admin/platform-settings/google-oauth", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGoogleOAuthConfig(data);
        if (data.clientId) {
          setGoogleClientId(data.clientId);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar config Google OAuth:", error);
    } finally {
      setLoadingGoogleOAuth(false);
    }
  }

  async function saveGoogleOAuthConfig() {
    if (!googleClientId || !googleClientSecret) {
      toast({
        title: "Erro",
        description: "Preencha o Client ID e Client Secret",
        variant: "destructive",
      });
      return;
    }

    setSavingGoogleOAuth(true);
    try {
      const res = await fetch("/api/admin/platform-settings/google-oauth", {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao salvar");
      }

      toast({
        title: "Sucesso",
        description: "Credenciais do Google OAuth salvas com sucesso",
      });
      setShowGoogleOAuthModal(false);
      setGoogleClientSecret("");
      fetchGoogleOAuthConfig();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingGoogleOAuth(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Globe className="w-8 h-8 text-primary" />
            Configurações da Plataforma
          </h1>
          <p className="text-muted-foreground">Integrações e configurações globais do sistema</p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <CardTitle>Google Calendar OAuth</CardTitle>
            </div>
            <CardDescription>
              Configure as credenciais OAuth do Google Cloud para permitir que os usuários integrem seus agentes de IA com o Google Calendar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30">
              <div className={`w-3 h-3 rounded-full ${googleOAuthConfig?.configured ? 'bg-green-500' : 'bg-red-500'}`} />
              <div className="flex-1">
                <p className="font-medium">Status da Integração</p>
                <p className="text-sm text-muted-foreground">
                  {loadingGoogleOAuth ? "Carregando..." : 
                   googleOAuthConfig?.configured ? "Credenciais configuradas e ativas" : "Não configurado - usuários não poderão conectar o Google Calendar"}
                </p>
                {googleOAuthConfig?.configured && googleOAuthConfig.clientId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Client ID: {googleOAuthConfig.clientId.slice(0, 30)}...
                  </p>
                )}
              </div>
              <Badge variant={googleOAuthConfig?.configured ? "default" : "destructive"}>
                {googleOAuthConfig?.configured ? "Ativo" : "Inativo"}
              </Badge>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={() => setShowGoogleOAuthModal(true)}
                data-testid="button-config-google-oauth"
              >
                {googleOAuthConfig?.configured ? "Editar Credenciais" : "Configurar Credenciais"}
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.open("https://console.cloud.google.com/apis/credentials", "_blank")}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Google Cloud Console
              </Button>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-start gap-2">
                <Shield className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Requisitos para o App OAuth</p>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                    <li>Projeto criado no Google Cloud Console</li>
                    <li>Google Calendar API habilitada</li>
                    <li>Tela de consentimento OAuth configurada</li>
                    <li>App publicado (status "Em produção") para usuários externos</li>
                    <li>URI de redirecionamento: <code className="bg-background px-1 rounded">{window.location.origin}/api/google/callback</code></li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showGoogleOAuthModal} onOpenChange={setShowGoogleOAuthModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Configurar Google Calendar OAuth
            </DialogTitle>
            <DialogDescription>
              Configure as credenciais OAuth do Google Cloud para permitir integração com Google Calendar.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {googleOAuthConfig?.configured && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Credenciais configuradas
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Client ID: {googleOAuthConfig.clientId?.slice(0, 20)}...
                </p>
                <p className="text-xs text-muted-foreground">
                  Client Secret: {googleOAuthConfig.clientSecretMasked}
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Client ID</label>
              <Input
                placeholder="Seu Google Client ID"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
                data-testid="input-google-client-id"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Client Secret</label>
              <Input
                type="password"
                placeholder={googleOAuthConfig?.configured ? "Digite para alterar..." : "Seu Google Client Secret"}
                value={googleClientSecret}
                onChange={(e) => setGoogleClientSecret(e.target.value)}
                data-testid="input-google-client-secret"
              />
            </div>
            
            <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
              <p className="font-medium mb-1">Como obter as credenciais:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Acesse console.cloud.google.com</li>
                <li>Crie ou selecione um projeto</li>
                <li>Habilite a Google Calendar API</li>
                <li>Vá em "Credenciais" e crie OAuth Client ID</li>
                <li>Configure o URI de redirect: <code className="bg-background px-1 rounded">{window.location.origin}/api/google/callback</code></li>
              </ol>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGoogleOAuthModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={saveGoogleOAuthConfig}
              disabled={savingGoogleOAuth || !googleClientId || !googleClientSecret}
              data-testid="button-save-google-oauth"
            >
              {savingGoogleOAuth ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Credenciais"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
