import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Settings, 
  Key, 
  Eye, 
  EyeOff, 
  Save,
  ExternalLink,
  CheckCircle,
  XCircle,
  Sparkles,
  Zap,
  Calendar,
  Link2,
  Unlink,
  RefreshCw
} from "lucide-react";
import { SiOpenai, SiGooglecalendar } from "react-icons/si";

type AIProvider = "openai" | "deepseek";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider>("openai");
  const [openaiKey, setOpenaiKey] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [deepseekConfigured, setDeepseekConfigured] = useState(false);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  const token = localStorage.getItem("adminToken");

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    fetchSettings();
    fetchGoogleCalendarStatus();
    
    const params = new URLSearchParams(searchString);
    if (params.get("calendar") === "connected") {
      toast({
        title: "Google Calendar Conectado",
        description: "Sua conta Google foi conectada com sucesso!",
      });
      window.history.replaceState({}, document.title, "/admin/configuracoes");
    } else if (params.get("calendar") === "error") {
      toast({
        title: "Erro ao conectar",
        description: params.get("message") || "Não foi possível conectar ao Google Calendar",
        variant: "destructive",
      });
      window.history.replaceState({}, document.title, "/admin/configuracoes");
    }
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        
        // Check provider
        if (data.ai_provider) {
          setAiProvider(data.ai_provider as AIProvider);
        }
        
        // Check OpenAI key
        if (data.openai_api_key === "***configured***") {
          setOpenaiConfigured(true);
        }
        
        // Check DeepSeek key
        if (data.deepseek_api_key === "***configured***") {
          setDeepseekConfigured(true);
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSetting(key: string, value: string) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ key, value }),
    });
    return res.ok;
  }

  async function saveProvider(provider: AIProvider) {
    setSaving(true);
    try {
      const success = await saveSetting("ai_provider", provider);
      if (success) {
        setAiProvider(provider);
        toast({
          title: "Sucesso",
          description: `Provedor alterado para ${provider === "openai" ? "OpenAI" : "DeepSeek"}`,
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar provedor",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveOpenAIKey() {
    if (!openaiKey.trim()) {
      toast({
        title: "Erro",
        description: "Digite a chave da API OpenAI",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const success = await saveSetting("openai_api_key", openaiKey.trim());
      if (success) {
        toast({
          title: "Sucesso",
          description: "Chave da API OpenAI salva com sucesso!",
        });
        setOpenaiConfigured(true);
        setOpenaiKey("");
        setShowOpenaiKey(false);
      } else {
        throw new Error("Erro ao salvar");
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar a chave da API",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeOpenAIKey() {
    setSaving(true);
    try {
      const success = await saveSetting("openai_api_key", "");
      if (success) {
        toast({
          title: "Sucesso",
          description: "Chave da API OpenAI removida",
        });
        setOpenaiConfigured(false);
        setOpenaiKey("");
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao remover a chave da API",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveDeepSeekKey() {
    if (!deepseekKey.trim()) {
      toast({
        title: "Erro",
        description: "Digite a chave da API DeepSeek",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const success = await saveSetting("deepseek_api_key", deepseekKey.trim());
      if (success) {
        toast({
          title: "Sucesso",
          description: "Chave da API DeepSeek salva com sucesso!",
        });
        setDeepseekConfigured(true);
        setDeepseekKey("");
        setShowDeepseekKey(false);
      } else {
        throw new Error("Erro ao salvar");
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar a chave da API",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeDeepSeekKey() {
    setSaving(true);
    try {
      const success = await saveSetting("deepseek_api_key", "");
      if (success) {
        toast({
          title: "Sucesso",
          description: "Chave da API DeepSeek removida",
        });
        setDeepseekConfigured(false);
        setDeepseekKey("");
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao remover a chave da API",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function fetchGoogleCalendarStatus() {
    try {
      const res = await fetch("/api/google/status", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setGoogleCalendarConnected(data.connected);
      }
    } catch (error) {
      console.error("Error fetching Google Calendar status:", error);
    }
  }

  async function connectGoogleCalendar() {
    setGoogleCalendarLoading(true);
    try {
      const res = await fetch("/api/google/auth-url", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.authUrl;
      } else {
        const error = await res.json();
        toast({
          title: "Erro",
          description: error.error || "Não foi possível iniciar a conexão",
          variant: "destructive",
        });
        setGoogleCalendarLoading(false);
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao conectar ao Google Calendar",
        variant: "destructive",
      });
      setGoogleCalendarLoading(false);
    }
  }

  async function disconnectGoogleCalendar() {
    setGoogleCalendarLoading(true);
    try {
      const res = await fetch("/api/google/disconnect", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setGoogleCalendarConnected(false);
        toast({
          title: "Sucesso",
          description: "Google Calendar desconectado",
        });
      } else {
        throw new Error("Erro ao desconectar");
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao desconectar o Google Calendar",
        variant: "destructive",
      });
    } finally {
      setGoogleCalendarLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Settings className="w-7 h-7 text-primary" />
          Configurações
        </h1>
        <p className="text-muted-foreground mt-1">
          Gerencie as configurações do sistema
        </p>
      </div>

      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>Provedor de IA</CardTitle>
              <CardDescription>
                Escolha qual serviço usar para o Designer IA
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={aiProvider}
            onValueChange={(value) => saveProvider(value as AIProvider)}
            className="space-y-3"
            data-testid="radio-ai-provider"
          >
            <div className="flex items-center space-x-3 p-4 rounded-lg border hover-elevate cursor-pointer">
              <RadioGroupItem value="openai" id="openai" data-testid="radio-openai" />
              <Label htmlFor="openai" className="flex-1 cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <SiOpenai className="w-5 h-5" />
                    <div>
                      <p className="font-medium">OpenAI</p>
                      <p className="text-sm text-muted-foreground">GPT-4o, modelos mais avançados</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {openaiConfigured && (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Configurado
                      </Badge>
                    )}
                  </div>
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-3 p-4 rounded-lg border hover-elevate cursor-pointer">
              <RadioGroupItem value="deepseek" id="deepseek" data-testid="radio-deepseek" />
              <Label htmlFor="deepseek" className="flex-1 cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Zap className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="font-medium">DeepSeek</p>
                      <p className="text-sm text-muted-foreground">~90% mais barato que OpenAI</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      Econômico
                    </Badge>
                    {deepseekConfigured && (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Configurado
                      </Badge>
                    )}
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>

          {aiProvider === "deepseek" && !deepseekConfigured && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Configure a chave da API DeepSeek abaixo para usar este provedor.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OpenAI Key */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md">
              <SiOpenai className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                OpenAI API
                {openaiConfigured ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                )}
              </CardTitle>
              <CardDescription>
                Chave para usar GPT-4o no Designer IA
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {openaiConfigured ? (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-green-600 dark:text-green-400">
                    Chave configurada
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={removeOpenAIKey}
                  disabled={saving}
                  data-testid="button-remove-openai-key"
                >
                  Remover
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Chave da API OpenAI
                </label>
                <div className="relative">
                  <Input
                    type={showOpenaiKey ? "text" : "password"}
                    placeholder="sk-..."
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="pr-10 font-mono"
                    data-testid="input-openai-key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    data-testid="button-toggle-openai-visibility"
                  >
                    {showOpenaiKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Obtenha sua chave em{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                    data-testid="link-openai-platform"
                  >
                    platform.openai.com
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>

              <Button
                onClick={saveOpenAIKey}
                disabled={saving || !openaiKey.trim()}
                className="gap-2"
                data-testid="button-save-openai-key"
              >
                <Save className="w-4 h-4" />
                {saving ? "Salvando..." : "Salvar Chave"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DeepSeek Key */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-md">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                DeepSeek API
                {deepseekConfigured ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                )}
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                  ~90% mais barato
                </Badge>
              </CardTitle>
              <CardDescription>
                Alternativa econômica para o Designer IA
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex gap-3">
              <Zap className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-600 dark:text-blue-400">
                  Opção econômica
                </p>
                <p className="text-muted-foreground mt-1">
                  DeepSeek oferece qualidade similar ao GPT-4 por uma fração do custo.
                  Ideal para reduzir gastos sem perder funcionalidade.
                </p>
              </div>
            </div>
          </div>

          {deepseekConfigured ? (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-green-600 dark:text-green-400">
                    Chave configurada
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={removeDeepSeekKey}
                  disabled={saving}
                  data-testid="button-remove-deepseek-key"
                >
                  Remover
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Chave da API DeepSeek
                </label>
                <div className="relative">
                  <Input
                    type={showDeepseekKey ? "text" : "password"}
                    placeholder="sk-..."
                    value={deepseekKey}
                    onChange={(e) => setDeepseekKey(e.target.value)}
                    className="pr-10 font-mono"
                    data-testid="input-deepseek-key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                    data-testid="button-toggle-deepseek-visibility"
                  >
                    {showDeepseekKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Obtenha sua chave em{" "}
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                    data-testid="link-deepseek-platform"
                  >
                    platform.deepseek.com
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>

              <Button
                onClick={saveDeepSeekKey}
                disabled={saving || !deepseekKey.trim()}
                className="gap-2"
                data-testid="button-save-deepseek-key"
              >
                <Save className="w-4 h-4" />
                {saving ? "Salvando..." : "Salvar Chave"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Calendar Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-green-500 shadow-md">
              <SiGooglecalendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Google Calendar
                {googleCalendarConnected ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                )}
              </CardTitle>
              <CardDescription>
                Sincronize agendamentos com sua agenda Google
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex gap-3">
              <Calendar className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-600 dark:text-blue-400">
                  Integração com Google Calendar
                </p>
                <p className="text-muted-foreground mt-1">
                  Conecte sua conta Google para sincronizar compromissos automaticamente.
                  Seus agentes de IA poderão agendar, reagendar e cancelar eventos via WhatsApp.
                </p>
              </div>
            </div>
          </div>

          {googleCalendarConnected ? (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-green-600 dark:text-green-400">
                    Google Calendar conectado
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={disconnectGoogleCalendar}
                  disabled={googleCalendarLoading}
                  className="gap-2"
                  data-testid="button-disconnect-google-calendar"
                >
                  <Unlink className="w-4 h-4" />
                  {googleCalendarLoading ? "Desconectando..." : "Desconectar"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={connectGoogleCalendar}
              disabled={googleCalendarLoading}
              className="gap-2"
              data-testid="button-connect-google-calendar"
            >
              {googleCalendarLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              {googleCalendarLoading ? "Conectando..." : "Conectar Google Calendar"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
