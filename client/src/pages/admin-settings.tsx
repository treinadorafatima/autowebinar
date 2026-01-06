import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  ShieldAlert,
  User,
  Mail,
  Lock,
  Phone
} from "lucide-react";
import { SiOpenai } from "react-icons/si";

type AIProvider = "openai" | "deepseek";

interface SubscriptionData {
  admin?: {
    role?: string;
  };
}

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
  const [openaiMaskedKey, setOpenaiMaskedKey] = useState("");
  const [deepseekMaskedKey, setDeepseekMaskedKey] = useState("");
  const [showOpenaiMasked, setShowOpenaiMasked] = useState(false);
  const [showDeepseekMasked, setShowDeepseekMasked] = useState(false);
  const [loadingOpenaiKey, setLoadingOpenaiKey] = useState(false);
  const [loadingDeepseekKey, setLoadingDeepseekKey] = useState(false);
  
  // Profile states
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [profileTelefone, setProfileTelefone] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  const token = localStorage.getItem("adminToken");

  const { data: subscription } = useQuery<SubscriptionData>({
    queryKey: ["/api/admin/subscription"],
  });

  const isSuperadmin = subscription?.admin?.role === "superadmin";

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    fetchAllData();
  }, []);

  async function fetchAllData() {
    setLoading(true);
    try {
      await Promise.all([fetchProfile(), fetchSettings()]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProfile() {
    try {
      const res = await fetch("/api/admin/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfileName(data.name || "");
        setProfileEmail(data.email || "");
        setOriginalEmail(data.email || "");
        setProfileTelefone(data.telefone || "");
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  }

  async function fetchSettings() {
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
    }
  }

  async function viewOpenAIKey() {
    setLoadingOpenaiKey(true);
    try {
      const res = await fetch("/api/settings/api-key/openai_api_key", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOpenaiMaskedKey(data.value || "");
        setShowOpenaiMasked(true);
      }
    } catch (error) {
      console.error("Error fetching OpenAI key:", error);
    } finally {
      setLoadingOpenaiKey(false);
    }
  }

  async function viewDeepSeekKey() {
    setLoadingDeepseekKey(true);
    try {
      const res = await fetch("/api/settings/api-key/deepseek_api_key", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDeepseekMaskedKey(data.value || "");
        setShowDeepseekMasked(true);
      }
    } catch (error) {
      console.error("Error fetching DeepSeek key:", error);
    } finally {
      setLoadingDeepseekKey(false);
    }
  }

  const isEmailChanged = profileEmail.toLowerCase() !== originalEmail.toLowerCase();

  async function saveProfile() {
    // If email is being changed, require password
    if (isEmailChanged && !emailPassword) {
      toast({
        title: "Senha necessária",
        description: "Para alterar o email, digite sua senha atual",
        variant: "destructive",
      });
      return;
    }

    setSavingProfile(true);
    try {
      const body: any = {
        name: profileName,
        telefone: profileTelefone,
      };

      // Include email change if modified
      if (isEmailChanged) {
        body.newEmail = profileEmail;
        body.currentPassword = emailPassword;
      }

      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        if (isEmailChanged) {
          toast({
            title: "Email alterado",
            description: "Você será redirecionado para fazer login novamente",
          });
          // Clear session and redirect to login
          localStorage.removeItem("adminToken");
          setTimeout(() => {
            setLocation("/login");
          }, 2000);
        } else {
          toast({
            title: "Sucesso",
            description: "Perfil atualizado com sucesso",
          });
        }
        setEmailPassword("");
      } else {
        const error = await res.json();
        throw new Error(error.error || "Erro ao atualizar perfil");
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Erro",
        description: "A nova senha deve ter pelo menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (res.ok) {
        toast({
          title: "Sucesso",
          description: "Senha alterada com sucesso",
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const error = await res.json();
        throw new Error(error.error || "Erro ao alterar senha");
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingPassword(false);
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
          Gerencie seu perfil e configurações do sistema
        </p>
      </div>

      {/* Profile Settings - Available to all admins */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>Meu Perfil</CardTitle>
              <CardDescription>
                Gerencie suas informações pessoais
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Nome
              </label>
              <Input
                placeholder="Seu nome"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                data-testid="input-profile-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                data-testid="input-profile-email"
              />
              {isEmailChanged && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Ao alterar o email, você precisará fazer login novamente
                </p>
              )}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Telefone
              </label>
              <Input
                placeholder="(00) 00000-0000"
                value={profileTelefone}
                onChange={(e) => setProfileTelefone(e.target.value)}
                data-testid="input-profile-telefone"
              />
            </div>
          </div>

          {isEmailChanged && (
            <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-3">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                Confirme sua senha para alterar o email
              </p>
              <div className="relative">
                <Input
                  type={showEmailPassword ? "text" : "password"}
                  placeholder="Digite sua senha atual"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  className="pr-10"
                  data-testid="input-email-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowEmailPassword(!showEmailPassword)}
                  data-testid="button-toggle-email-password"
                >
                  {showEmailPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          <Button
            onClick={saveProfile}
            disabled={savingProfile || (isEmailChanged && !emailPassword)}
            className="gap-2"
            data-testid="button-save-profile"
          >
            <Save className="w-4 h-4" />
            {savingProfile ? "Salvando..." : "Salvar Perfil"}
          </Button>
        </CardContent>
      </Card>

      {/* Password Change - Available to all admins */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>Alterar Senha</CardTitle>
              <CardDescription>
                Atualize sua senha de acesso
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Senha Atual</label>
            <div className="relative">
              <Input
                type={showCurrentPassword ? "text" : "password"}
                placeholder="Digite sua senha atual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="pr-10"
                data-testid="input-current-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                data-testid="button-toggle-current-password"
              >
                {showCurrentPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nova Senha</label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Digite a nova senha"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                  data-testid="input-new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  data-testid="button-toggle-new-password"
                >
                  {showNewPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirmar Nova Senha</label>
              <Input
                type={showNewPassword ? "text" : "password"}
                placeholder="Confirme a nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                data-testid="input-confirm-password"
              />
            </div>
          </div>
          <Button
            onClick={savePassword}
            disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="gap-2"
            data-testid="button-save-password"
          >
            <Lock className="w-4 h-4" />
            {savingPassword ? "Alterando..." : "Alterar Senha"}
          </Button>
        </CardContent>
      </Card>

      {/* Superadmin-only AI Configuration */}
      {isSuperadmin ? (
        <>
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
                <div className="space-y-3">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="font-medium text-green-600 dark:text-green-400">
                          Chave configurada
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={viewOpenAIKey}
                          disabled={loadingOpenaiKey}
                          data-testid="button-view-openai-key"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          {loadingOpenaiKey ? "Carregando..." : "Visualizar"}
                        </Button>
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
                  </div>
                  {showOpenaiMasked && (
                    <div className="p-3 rounded-lg bg-muted border">
                      <div className="flex items-center justify-between">
                        <code className="text-sm font-mono">
                          {openaiMaskedKey || "Chave não encontrada"}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowOpenaiMasked(false)}
                          data-testid="button-hide-openai-key"
                        >
                          <EyeOff className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
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
                <div className="space-y-3">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="font-medium text-green-600 dark:text-green-400">
                          Chave configurada
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={viewDeepSeekKey}
                          disabled={loadingDeepseekKey}
                          data-testid="button-view-deepseek-key"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          {loadingDeepseekKey ? "Carregando..." : "Visualizar"}
                        </Button>
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
                  </div>
                  {showDeepseekMasked && (
                    <div className="p-3 rounded-lg bg-muted border">
                      <div className="flex items-center justify-between">
                        <code className="text-sm font-mono">
                          {deepseekMaskedKey || "Chave não encontrada"}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDeepseekMasked(false)}
                          data-testid="button-hide-deepseek-key"
                        >
                          <EyeOff className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
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
        </>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 text-muted-foreground">
              <ShieldAlert className="w-8 h-8" />
              <div>
                <p className="font-medium text-foreground">Acesso Restrito</p>
                <p className="text-sm">
                  As configurações de API keys estão disponíveis apenas para superadministradores.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
