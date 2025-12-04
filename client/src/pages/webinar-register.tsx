import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Calendar, Clock, Users, Video, MapPin } from "lucide-react";
import type { Webinar, LeadFormConfig } from "@shared/schema";

function getNextSessionDate(webinar: Webinar): { date: string; time: string; dayOfWeek: string } | null {
  if (!webinar) return null;
  
  const now = new Date();
  const hour = webinar.startHour ?? 18;
  const minute = webinar.startMinute ?? 0;
  
  const sessionDate = new Date();
  sessionDate.setHours(hour, minute, 0, 0);
  
  if (sessionDate <= now) {
    sessionDate.setDate(sessionDate.getDate() + 1);
  }
  
  const recurrence = webinar.recurrence || "daily";
  
  if (recurrence === "weekly" && (webinar as any).scheduleDays) {
    try {
      const days = JSON.parse((webinar as any).scheduleDays);
      if (Array.isArray(days) && days.length > 0) {
        let found = false;
        for (let i = 0; i < 7 && !found; i++) {
          const checkDate = new Date(sessionDate);
          checkDate.setDate(sessionDate.getDate() + i);
          const dayOfWeek = checkDate.getDay();
          if (days.includes(dayOfWeek)) {
            sessionDate.setDate(checkDate.getDate());
            found = true;
          }
        }
      }
    } catch {}
  }
  
  const daysOfWeek = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  
  return {
    date: sessionDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
    dayOfWeek: daysOfWeek[sessionDate.getDay()],
  };
}

export default function WebinarRegister() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [webinar, setWebinar] = useState<Webinar | null>(null);
  const [formConfig, setFormConfig] = useState<Partial<LeadFormConfig> | null>(null);
  const [isEmbed, setIsEmbed] = useState(false);
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setIsEmbed(urlParams.get("embed") === "true");
    
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

  const nextSession = useMemo(() => {
    if (!webinar) return null;
    return getNextSessionDate(webinar);
  }, [webinar]);

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
          if (isEmbed) {
            window.parent.location.href = formConfig.redirectUrl;
          } else {
            window.location.href = formConfig.redirectUrl;
          }
        } else if (!isEmbed) {
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

  const styles = {
    backgroundColor: formConfig?.backgroundColor || "#1a1a2e",
    cardBackgroundColor: formConfig?.cardBackgroundColor || "#16213e",
    textColor: formConfig?.textColor || "#ffffff",
    inputBackgroundColor: formConfig?.inputBackgroundColor || "#0f0f23",
    inputBorderColor: formConfig?.inputBorderColor || "#374151",
    inputTextColor: formConfig?.inputTextColor || "#ffffff",
    labelColor: formConfig?.labelColor || "#9ca3af",
    buttonColor: formConfig?.buttonColor || "#22c55e",
    buttonTextColor: formConfig?.buttonTextColor || "#ffffff",
    borderRadius: formConfig?.borderRadius || "8",
    fontFamily: formConfig?.fontFamily || "Inter, system-ui, sans-serif",
  };

  if (loading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center" 
        style={{ backgroundColor: styles.backgroundColor, fontFamily: styles.fontFamily }}
      >
        <div className="text-center" style={{ color: styles.textColor }}>
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!webinar) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center" 
        style={{ backgroundColor: styles.backgroundColor, fontFamily: styles.fontFamily }}
      >
        <div className="text-center" style={{ color: styles.textColor }}>
          <h1 className="text-2xl font-bold mb-4">Webinário não encontrado</h1>
          <p style={{ color: styles.labelColor }}>Verifique o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div 
        className={`flex items-center justify-center p-4 ${isEmbed ? "min-h-[400px]" : "min-h-screen"}`}
        style={{ backgroundColor: styles.backgroundColor, fontFamily: styles.fontFamily }}
      >
        <div 
          className="w-full max-w-md text-center p-8"
          style={{ 
            backgroundColor: styles.cardBackgroundColor, 
            borderRadius: `${styles.borderRadius}px`,
          }}
        >
          <CheckCircle2 className="w-16 h-16 mx-auto mb-4" style={{ color: styles.buttonColor }} />
          <h2 className="text-2xl font-bold mb-2" style={{ color: styles.textColor }}>
            {formConfig?.successMessage || "Inscrição Confirmada!"}
          </h2>
          <p className="mb-6" style={{ color: styles.labelColor }}>
            {isEmbed 
              ? "Sua inscrição foi realizada com sucesso!" 
              : "Você será redirecionado para o webinário em instantes..."}
          </p>
          {!isEmbed && <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: styles.buttonColor }} />}
        </div>
      </div>
    );
  }

  const collectEmail = formConfig?.collectEmail ?? true;
  const collectWhatsapp = formConfig?.collectWhatsapp ?? true;
  const collectCity = formConfig?.collectCity ?? false;
  const collectState = formConfig?.collectState ?? false;
  const requireConsent = formConfig?.requireConsent ?? true;
  const showNextSession = formConfig?.showNextSession ?? true;

  return (
    <div 
      className={`flex items-center justify-center p-4 ${isEmbed ? "min-h-[500px]" : "min-h-screen"}`}
      style={{ backgroundColor: styles.backgroundColor, fontFamily: styles.fontFamily }}
    >
      <div className="w-full max-w-md">
        {formConfig?.logoUrl && (
          <div className="text-center mb-4">
            <img 
              src={formConfig.logoUrl} 
              alt="Logo" 
              className="h-12 mx-auto object-contain"
            />
          </div>
        )}
        
        {formConfig?.headerImageUrl && (
          <div 
            className="mb-4 overflow-hidden"
            style={{ borderRadius: `${styles.borderRadius}px` }}
          >
            <img 
              src={formConfig.headerImageUrl} 
              alt="Header" 
              className="w-full h-32 object-cover"
            />
          </div>
        )}
        
        <div 
          className="shadow-2xl overflow-hidden"
          style={{ 
            backgroundColor: styles.cardBackgroundColor,
            borderRadius: `${styles.borderRadius}px`,
          }}
        >
          <div className="p-6 pb-4 text-center">
            <h1 
              className="text-xl md:text-2xl font-bold mb-2"
              style={{ color: styles.textColor }}
            >
              {formConfig?.title || webinar.pageTitle || webinar.name || "Inscreva-se no Webinário"}
            </h1>
            {(formConfig?.subtitle || webinar.description) && (
              <p style={{ color: styles.labelColor }}>
                {formConfig?.subtitle || webinar.description}
              </p>
            )}
          </div>
          
          {showNextSession && nextSession && (
            <div 
              className="mx-6 mb-4 p-4 flex flex-wrap justify-center gap-3 text-sm"
              style={{ 
                backgroundColor: styles.inputBackgroundColor,
                borderRadius: `${styles.borderRadius}px`,
                color: styles.labelColor,
              }}
            >
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" style={{ color: styles.buttonColor }} />
                <span>{nextSession.dayOfWeek}, {nextSession.date}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" style={{ color: styles.buttonColor }} />
                <span>{nextSession.time}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Video className="w-4 h-4" style={{ color: styles.buttonColor }} />
                <span>Ao Vivo</span>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-4">
            <div>
              <Label 
                htmlFor="name" 
                className="text-sm font-medium mb-1.5 block"
                style={{ color: styles.labelColor }}
              >
                Nome completo *
              </Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Digite seu nome"
                data-testid="input-register-name"
                required
                className="border transition-colors focus:ring-2"
                style={{ 
                  backgroundColor: styles.inputBackgroundColor,
                  borderColor: styles.inputBorderColor,
                  color: styles.inputTextColor,
                  borderRadius: `${styles.borderRadius}px`,
                }}
              />
            </div>
            
            {collectEmail && (
              <div>
                <Label 
                  htmlFor="email"
                  className="text-sm font-medium mb-1.5 block"
                  style={{ color: styles.labelColor }}
                >
                  E-mail *
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  data-testid="input-register-email"
                  required
                  className="border transition-colors focus:ring-2"
                  style={{ 
                    backgroundColor: styles.inputBackgroundColor,
                    borderColor: styles.inputBorderColor,
                    color: styles.inputTextColor,
                    borderRadius: `${styles.borderRadius}px`,
                  }}
                />
              </div>
            )}
            
            {collectWhatsapp && (
              <div>
                <Label 
                  htmlFor="whatsapp"
                  className="text-sm font-medium mb-1.5 block"
                  style={{ color: styles.labelColor }}
                >
                  WhatsApp *
                </Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(formatWhatsapp(e.target.value))}
                  placeholder="(11) 99999-9999"
                  data-testid="input-register-whatsapp"
                  required
                  className="border transition-colors focus:ring-2"
                  style={{ 
                    backgroundColor: styles.inputBackgroundColor,
                    borderColor: styles.inputBorderColor,
                    color: styles.inputTextColor,
                    borderRadius: `${styles.borderRadius}px`,
                  }}
                />
              </div>
            )}
            
            {(collectCity || collectState) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {collectCity && (
                  <div>
                    <Label 
                      htmlFor="city"
                      className="text-sm font-medium mb-1.5 block"
                      style={{ color: styles.labelColor }}
                    >
                      Cidade
                    </Label>
                    <Input
                      id="city"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Sua cidade"
                      data-testid="input-register-city"
                      className="border transition-colors focus:ring-2"
                      style={{ 
                        backgroundColor: styles.inputBackgroundColor,
                        borderColor: styles.inputBorderColor,
                        color: styles.inputTextColor,
                        borderRadius: `${styles.borderRadius}px`,
                      }}
                    />
                  </div>
                )}
                {collectState && (
                  <div>
                    <Label 
                      htmlFor="state"
                      className="text-sm font-medium mb-1.5 block"
                      style={{ color: styles.labelColor }}
                    >
                      Estado (UF)
                    </Label>
                    <Input
                      id="state"
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="SP"
                      maxLength={2}
                      data-testid="input-register-state"
                      className="border transition-colors focus:ring-2"
                      style={{ 
                        backgroundColor: styles.inputBackgroundColor,
                        borderColor: styles.inputBorderColor,
                        color: styles.inputTextColor,
                        borderRadius: `${styles.borderRadius}px`,
                      }}
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
                  className="mt-0.5"
                />
                <Label 
                  htmlFor="consent" 
                  className="text-sm cursor-pointer leading-tight"
                  style={{ color: styles.labelColor }}
                >
                  {formConfig?.consentText || "Concordo em receber comunicações sobre este webinário por e-mail e WhatsApp"}
                </Label>
              </div>
            )}
            
            <Button
              type="submit"
              className="w-full text-base md:text-lg py-5 md:py-6 font-bold transition-opacity hover:opacity-90"
              style={{ 
                backgroundColor: styles.buttonColor,
                color: styles.buttonTextColor,
                borderRadius: `${styles.borderRadius}px`,
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
          
          <p 
            className="text-xs text-center pb-6 px-6"
            style={{ color: styles.labelColor }}
          >
            Seus dados estão seguros e não serão compartilhados com terceiros.
          </p>
        </div>
      </div>
    </div>
  );
}
