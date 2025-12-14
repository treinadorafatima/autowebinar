import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock } from "lucide-react";
import logoImage from "@assets/autowebinar-logo.png";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Erro", description: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Email ou senha incorretos");
      }

      const data = await res.json();
      localStorage.setItem("adminToken", data.token);
      toast({ title: "Sucesso", description: "Login realizado!" });
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

  return (
    <div className="min-h-screen flex">
      {/* Desktop: painel esquerdo com branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0a1628] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          <img 
            src={logoImage} 
            alt="AutoWebinar" 
            className="w-96 h-auto object-contain mb-12"
            data-testid="img-logo-hero"
          />
          
          <div className="text-center max-w-md">
            <h2 className="text-4xl font-bold text-white mb-4">
              Automatize seus
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
                Webinars
              </span>
            </h2>
            <p className="text-slate-400 text-lg">
              A plataforma completa para criar webinars automatizados que vendem 24/7
            </p>
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

      {/* Mobile: fundo escuro com gradiente / Desktop: fundo branco */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-[#0a1628] lg:bg-white p-6 lg:p-8 relative overflow-hidden">
        {/* Efeitos de blur no mobile */}
        <div className="lg:hidden absolute inset-0">
          <div className="absolute top-10 right-10 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-5 w-32 h-32 bg-blue-500/15 rounded-full blur-3xl" />
        </div>
        
        <div className="w-full max-w-md relative z-10">
          {/* Logo mobile - sem caixa quadrada */}
          <div className="lg:hidden flex justify-center mb-8">
            <img 
              src={logoImage} 
              alt="AutoWebinar" 
              className="w-56 h-auto object-contain"
              data-testid="img-logo-mobile"
            />
          </div>

          {/* Card de login no mobile */}
          <div className="bg-white/95 lg:bg-transparent backdrop-blur-sm lg:backdrop-blur-none rounded-2xl lg:rounded-none p-6 lg:p-0 shadow-xl lg:shadow-none">
            <div className="text-center mb-6 lg:mb-8">
              <h1 className="text-xl lg:text-2xl font-semibold text-gray-900 mb-1 lg:mb-2">
                Bem-vindo de volta!
              </h1>
              <p className="text-gray-500 text-sm lg:text-base">
                Insira seu e-mail e senha para continuar
              </p>
            </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                E-mail *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
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
              <label className="block text-sm font-medium text-gray-700">
                Senha *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  disabled={loading}
                  className="pl-10 h-12 border-gray-300 focus:border-cyan-500 focus:ring-cyan-500"
                  data-testid="input-password"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Link 
                href="/forgot-password" 
                className="text-sm text-cyan-600 hover:text-cyan-700 transition-colors"
                data-testid="link-forgot-password"
              >
                Esqueceu a senha?
              </Link>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-medium text-base"
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Entrando...
                </span>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

            <div className="mt-6 lg:mt-8 pt-4 lg:pt-6 border-t border-gray-200">
              <p className="text-center text-sm text-gray-500">
                Todos os direitos reservados <span className="font-medium text-gray-700">AutoWebinar</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
