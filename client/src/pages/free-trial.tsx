import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  User, 
  Mail, 
  Phone, 
  Lock,
  Eye,
  EyeOff,
  Loader2, 
  CheckCircle, 
  Video, 
  HardDrive, 
  Clock,
  Rocket,
  ArrowLeft
} from "lucide-react";
import logoImage from "@assets/autowebinar-logo.png";
import logoLightBg from "@assets/image_1767375365474.png";

const COUNTRY_CODES = [
  { code: "+55", country: "Brasil", abbr: "BR" },
  { code: "+1", country: "EUA/Canadá", abbr: "US" },
  { code: "+351", country: "Portugal", abbr: "PT" },
  { code: "+34", country: "Espanha", abbr: "ES" },
  { code: "+54", country: "Argentina", abbr: "AR" },
  { code: "+56", country: "Chile", abbr: "CL" },
  { code: "+57", country: "Colômbia", abbr: "CO" },
  { code: "+52", country: "México", abbr: "MX" },
  { code: "+595", country: "Paraguai", abbr: "PY" },
  { code: "+598", country: "Uruguai", abbr: "UY" },
  { code: "+51", country: "Peru", abbr: "PE" },
  { code: "+58", country: "Venezuela", abbr: "VE" },
  { code: "+44", country: "Reino Unido", abbr: "UK" },
  { code: "+49", country: "Alemanha", abbr: "DE" },
  { code: "+33", country: "França", abbr: "FR" },
  { code: "+39", country: "Itália", abbr: "IT" },
];

export default function FreeTrialPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countryCode, setCountryCode] = useState("+55");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({ title: "Erro", description: "Digite seu nome", variant: "destructive" });
      return;
    }
    if (!email.trim()) {
      toast({ title: "Erro", description: "Digite seu e-mail", variant: "destructive" });
      return;
    }
    if (!password.trim() || password.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }
    if (!whatsapp.trim()) {
      toast({ title: "Erro", description: "Digite seu WhatsApp", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password: password,
          whatsapp: `${countryCode}${whatsapp.replace(/\D/g, "")}`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao criar conta");
      }

      localStorage.setItem("adminToken", data.token);
      toast({ 
        title: "Conta criada com sucesso!", 
        description: "Você tem 7 dias de teste grátis." 
      });
      setLocation("/admin");
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const trialBenefits = [
    { icon: Video, text: "1 webinar ativo", highlight: true },
    { icon: HardDrive, text: "1GB de upload", highlight: true },
    { icon: Clock, text: "7 dias grátis", highlight: true },
  ];

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-[#0a1628] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-green-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          <img 
            src={logoImage} 
            alt="AutoWebinar" 
            className="w-80 h-auto object-contain mb-12"
            data-testid="img-logo-hero"
          />
          
          <div className="text-center max-w-md">
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 mb-4">
              Teste Grátis 7 Dias
            </Badge>
            <h2 className="text-4xl font-bold text-white mb-4">
              Comece agora
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
                sem cartão de crédito
              </span>
            </h2>
            <p className="text-slate-400 text-lg">
              Experimente a plataforma completa por 7 dias e descubra como automatizar seus webinars.
            </p>
          </div>

          <div className="mt-12 space-y-4 w-full max-w-sm">
            {trialBenefits.map((benefit, index) => (
              <div 
                key={index}
                className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                  <benefit.icon className="w-5 h-5 text-cyan-400" />
                </div>
                <span className="text-white font-medium">{benefit.text}</span>
                <CheckCircle className="w-5 h-5 text-green-400 ml-auto" />
              </div>
            ))}
          </div>

          <div className="mt-16 flex items-center gap-8 text-slate-500">
            <div className="text-center">
              <div className="text-3xl font-bold text-white">24/7</div>
              <div className="text-sm">Disponibilidade</div>
            </div>
            <div className="w-px h-12 bg-slate-700" />
            <div className="text-center">
              <div className="text-3xl font-bold text-white">100%</div>
              <div className="text-sm">Automatizado</div>
            </div>
            <div className="w-px h-12 bg-slate-700" />
            <div className="text-center">
              <div className="text-3xl font-bold text-white">+Leads</div>
              <div className="text-sm">Capturados</div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex justify-center mb-8">
            <img 
              src={logoLightBg} 
              alt="AutoWebinar" 
              className="h-12 w-auto object-contain"
              data-testid="img-logo-mobile"
            />
          </div>

          <div className="text-center mb-8">
            <Badge className="bg-green-100 text-green-700 border-green-200 mb-4">
              7 Dias Grátis
            </Badge>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Criar conta gratuita
            </h1>
            <p className="text-gray-500">
              Preencha os dados abaixo para começar seu teste
            </p>
          </div>

          <Card className="border-0 shadow-none">
            <CardContent className="p-0">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                    Nome completo *
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Seu nome completo"
                      disabled={loading}
                      className="pl-10 h-12 border-gray-300 focus:border-cyan-500 focus:ring-cyan-500"
                      data-testid="input-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                    E-mail *
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      disabled={loading}
                      className="pl-10 h-12 border-gray-300 focus:border-cyan-500 focus:ring-cyan-500"
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                    Senha *
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      disabled={loading}
                      className="pl-10 pr-10 h-12 border-gray-300 focus:border-cyan-500 focus:ring-cyan-500"
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">
                    WhatsApp *
                  </Label>
                  <div className="flex gap-2">
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger className="w-[140px] h-12 border-gray-300" data-testid="select-country-code">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRY_CODES.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            <span className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">{country.abbr}</span>
                              <span>{country.code}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        type="tel"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        placeholder="(00) 00000-0000"
                        disabled={loading}
                        className="pl-10 h-12 border-gray-300 focus:border-cyan-500 focus:ring-cyan-500"
                        data-testid="input-whatsapp"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-green-50 border border-green-100">
                  <h4 className="font-medium text-green-800 mb-2 flex items-center gap-2">
                    <Rocket className="w-4 h-4" />
                    Limites do plano de teste
                  </h4>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Até 1 webinar ativo
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Máximo de 1GB de upload
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Válido por 7 dias
                    </li>
                  </ul>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-medium text-base"
                  disabled={loading}
                  data-testid="button-submit"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Criando conta...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Rocket className="h-5 w-5" />
                      Criar conta grátis
                    </span>
                  )}
                </Button>

                <p className="text-center text-sm text-gray-500">
                  Ao criar sua conta, você concorda com nossos{" "}
                  <a href="#" className="text-cyan-600 hover:underline">Termos de Uso</a>
                  {" "}e{" "}
                  <a href="#" className="text-cyan-600 hover:underline">Política de Privacidade</a>.
                </p>
              </form>
            </CardContent>
          </Card>

          <div className="mt-6 text-center">
            <button 
              onClick={() => setLocation("/login")}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mx-auto"
              data-testid="link-login"
            >
              <ArrowLeft className="w-4 h-4" />
              Já tenho uma conta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
