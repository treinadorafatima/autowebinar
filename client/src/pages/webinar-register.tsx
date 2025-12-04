import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Calendar, Clock, Users, Video } from "lucide-react";
import type { Webinar, LeadFormConfig } from "@shared/schema";

export default function WebinarRegister() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [webinar, setWebinar] = useState<Webinar | null>(null);
  const [formConfig, setFormConfig] = useState<LeadFormConfig | null>(null);
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (params.slug) {
      loadWebinarAndForm();
    }
  }, [params.slug]);

  async function loadWebinarAndForm() {
    try {
      const webinarRes = await fetch(`/api/webinars/${params.slug}`);
      if (webinarRes.ok) {
        const webinarData = await webinarRes.json();
        setWebinar(webinarData);
        
        const formRes = await fetch(`/api/webinars/${webinarData.id}/lead-form-config`);
        if (formRes.ok) {
          const formData = await formRes.json();
          setFormConfig(formData);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar webinar:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatWhatsapp(value: string) {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!webinar) return;
    
    const collectEmail = formConfig?.collectEmail ?? true;
    const collectWhatsapp = formConfig?.collectWhatsapp ?? true;
    const collectCity = formConfig?.collectCity ?? false;
    const collectState = formConfig?.collectState ?? false;
    const requireConsent = formConfig?.requireConsent ?? true;
    
    if (!name.trim()) {
      toast({ title: "Digite seu nome", variant: "destructive" });
      return;
    }
    if (collectEmail && !email.trim()) {
      toast({ title: "Digite seu e-mail", variant: "destructive" });
      return;
    }
    if (collectWhatsapp && !whatsapp.trim()) {
      toast({ title: "Digite seu WhatsApp", variant: "destructive" });
      return;
    }
    if (requireConsent && !consent) {
      toast({ title: "Aceite os termos para continuar", variant: "destructive" });
      return;
    }
    
    setSubmitting(true);
    
    try {
      const res = await fetch(`/api/webinars/${webinar.id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: collectEmail ? email.trim() : null,
          whatsapp: collectWhatsapp ? whatsapp.replace(/\D/g, "") : null,
          city: collectCity ? city.trim() : null,
          state: collectState ? state.trim().toUpperCase() : null,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setSuccess(true);
        
        localStorage.setItem(`webinar-${params.slug}-registered`, "true");
        localStorage.setItem(`webinar-${params.slug}-userName`, name);
        localStorage.setItem(`webinar-${params.slug}-leadId`, data.id);
        if (email) localStorage.setItem(`webinar-${params.slug}-userEmail`, email);
        if (whatsapp) localStorage.setItem(`webinar-${params.slug}-userWhatsapp`, whatsapp);
        if (city) localStorage.setItem(`webinar-${params.slug}-userCity`, city);
        if (state) localStorage.setItem(`webinar-${params.slug}-userState`, state);
        
        toast({ 
          title: formConfig?.successMessage || "Inscrição realizada com sucesso!",
          description: "Você receberá lembretes antes do webinário."
        });
        
        if (formConfig?.redirectUrl) {
          window.location.href = formConfig.redirectUrl;
        } else {
          setTimeout(() => {
            navigate(`/w/${params.slug}`);
          }, 2000);
        }
      } else {
        const error = await res.json();
        toast({ title: error.message || "Erro ao realizar inscrição", variant: "destructive" });
      }
    } catch (error) {
      console.error("Erro:", error);
      toast({ title: "Erro ao realizar inscrição", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: formConfig?.backgroundColor || "#4A8BB5" }}>
        <div className="text-center text-white">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!webinar) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <h1 className="text-2xl font-bold mb-4">Webinário não encontrado</h1>
          <p className="text-gray-400">Verifique o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: formConfig?.backgroundColor || webinar.pageBackgroundColor || "#4A8BB5" }}
      >
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">
              {formConfig?.successMessage || "Inscrição Confirmada!"}
            </h2>
            <p className="text-muted-foreground mb-6">
              Você será redirecionado para o webinário em instantes...
            </p>
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const collectEmail = formConfig?.collectEmail ?? true;
  const collectWhatsapp = formConfig?.collectWhatsapp ?? true;
  const collectCity = formConfig?.collectCity ?? false;
  const collectState = formConfig?.collectState ?? false;
  const requireConsent = formConfig?.requireConsent ?? true;

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: formConfig?.backgroundColor || webinar.pageBackgroundColor || "#4A8BB5" }}
    >
      <div className="w-full max-w-lg">
        {webinar.pageBadgeText && (
          <div className="text-center mb-4">
            <span className="inline-block px-4 py-1 bg-red-600 text-white text-sm font-bold rounded-full uppercase">
              {webinar.pageBadgeText}
            </span>
          </div>
        )}
        
        <Card className="shadow-2xl">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl md:text-3xl font-bold" style={{ color: formConfig?.textColor || "#000000" }}>
              {formConfig?.title || webinar.pageTitle || webinar.name || "Inscreva-se no Webinário"}
            </CardTitle>
            {(formConfig?.subtitle || webinar.description) && (
              <CardDescription className="text-base mt-2">
                {formConfig?.subtitle || webinar.description}
              </CardDescription>
            )}
          </CardHeader>
          
          <CardContent>
            <div className="flex flex-wrap justify-center gap-4 mb-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>Em breve</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{webinar.startHour?.toString().padStart(2, '0')}:{webinar.startMinute?.toString().padStart(2, '0')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Video className="w-4 h-4" />
                <span>Ao Vivo</span>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome completo *</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Digite seu nome"
                  data-testid="input-register-name"
                  required
                />
              </div>
              
              {collectEmail && (
                <div>
                  <Label htmlFor="email">E-mail *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    data-testid="input-register-email"
                    required
                  />
                </div>
              )}
              
              {collectWhatsapp && (
                <div>
                  <Label htmlFor="whatsapp">WhatsApp *</Label>
                  <Input
                    id="whatsapp"
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(formatWhatsapp(e.target.value))}
                    placeholder="(11) 99999-9999"
                    data-testid="input-register-whatsapp"
                    required
                  />
                </div>
              )}
              
              {(collectCity || collectState) && (
                <div className="grid grid-cols-2 gap-4">
                  {collectCity && (
                    <div>
                      <Label htmlFor="city">Cidade</Label>
                      <Input
                        id="city"
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Sua cidade"
                        data-testid="input-register-city"
                      />
                    </div>
                  )}
                  {collectState && (
                    <div>
                      <Label htmlFor="state">Estado (UF)</Label>
                      <Input
                        id="state"
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                        placeholder="SP"
                        maxLength={2}
                        data-testid="input-register-state"
                      />
                    </div>
                  )}
                </div>
              )}
              
              {requireConsent && (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="consent"
                    checked={consent}
                    onCheckedChange={(checked) => setConsent(checked === true)}
                    data-testid="checkbox-consent"
                  />
                  <Label htmlFor="consent" className="text-sm text-muted-foreground cursor-pointer leading-tight">
                    {formConfig?.consentText || "Concordo em receber comunicações sobre este webinário por e-mail e WhatsApp"}
                  </Label>
                </div>
              )}
              
              <Button
                type="submit"
                className="w-full text-lg py-6 font-bold"
                style={{ 
                  backgroundColor: formConfig?.buttonColor || "#22c55e",
                  color: "#ffffff"
                }}
                disabled={submitting}
                data-testid="button-register-submit"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Processando...
                  </>
                ) : (
                  formConfig?.buttonText || "Quero Participar"
                )}
              </Button>
            </form>
            
            <p className="text-xs text-center text-muted-foreground mt-4">
              Seus dados estão seguros e não serão compartilhados com terceiros.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
