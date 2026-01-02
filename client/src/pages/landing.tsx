import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ArrowRight,
  Video,
  Users,
  Globe,
  Zap,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Lock,
  BarChart3,
  Code,
  Clock,
  Play,
  Shield,
  Star,
  Crown,
  Rocket,
  Target,
  MessageSquare,
  Calendar,
  Check,
  FileText,
  Mail,
  X,
  Mic,
  Bot,
  Send,
  Bell,
  Upload,
  Settings,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";

import carlosSilvaImg from "@assets/generated_images/carlos_silva_headshot_portrait.png";
import anaPaulaImg from "@assets/generated_images/ana_paula_headshot_portrait.png";
import robertoMendesImg from "@assets/generated_images/roberto_mendes_headshot_portrait.png";
import logoAutoWebinar from "@assets/logo-autowebinar_1764493901947.png";

interface AccountInfo {
  name: string;
  landingPageTitle: string;
  landingPageDescription: string;
  webinarCount: number;
}

interface Plano {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  prazoDias: number;
  webinarLimit: number;
  uploadLimit: number;
  storageLimit: number;
  whatsappAccountLimit: number;
  ativo: boolean;
  destaque: boolean;
  exibirNaLanding?: boolean;
  beneficios: string;
  ordem: number;
  tipoCobranca: string;
  frequencia: number;
  frequenciaTipo: string;
}

export default function LandingPage() {
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  const { data: planos, isLoading: isLoadingPlanos, error: planosError } = useQuery<Plano[]>({
    queryKey: ["/api/checkout/planos"],
    queryFn: async () => {
      const res = await fetch("/api/checkout/planos");
      if (!res.ok) throw new Error("Erro ao carregar planos");
      return res.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const planosAtivos = planos?.filter(p => p.ativo && p.exibirNaLanding !== false)?.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)) || [];

  useEffect(() => {
    async function loadAccountInfo() {
      try {
        const domain = window.location.hostname;
        const res = await fetch(`/api/account/by-domain/${domain}`);

        if (res.ok) {
          const data = await res.json();
          setAccountInfo(data);
        } else {
          setAccountInfo({
            name: "AutoWebinar",
            landingPageTitle: "Venda Mais com Webinários Automáticos",
            landingPageDescription:
              "Transforme seu conhecimento em vendas 24/7. Webinários profissionais que rodam no piloto automático enquanto você foca no que importa.",
            webinarCount: 0,
          });
        }
      } catch (error) {
        console.error("Erro ao carregar conta:", error);
      } finally {
        setLoading(false);
      }
    }
    loadAccountInfo();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  const getBeneficios = (beneficiosStr: string): string[] => {
    try {
      return JSON.parse(beneficiosStr || "[]");
    } catch {
      return [];
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-blue-600/10 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-cyan-600/10 via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      {/* Navigation */}
      <nav className="border-b border-slate-800/50 bg-slate-950/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <img 
              src={logoAutoWebinar} 
              alt={accountInfo?.name || "AutoWebinar"} 
              className="h-10 w-auto"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                const el = document.getElementById('pricing');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              variant="ghost"
              className="text-slate-300 hover:text-white hidden sm:flex"
              data-testid="button-nav-pricing"
            >
              Planos
            </Button>
            <Button
              onClick={() => setLocation("/login")}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-500/25"
              data-testid="button-nav-login"
            >
              Entrar
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section - Ultra Premium Design */}
      <section className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Gradient Orbs */}
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/20 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute top-20 right-1/4 w-[500px] h-[500px] bg-cyan-500/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute bottom-0 left-1/2 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
          {/* Grid Pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 pb-24">
          <div className="text-center space-y-10">
            {/* Premium Badge */}
            <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-purple-500/10 border border-blue-500/20 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-sm font-medium bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Plataforma 100% Brasileira
              </span>
            </div>

            {/* Main Headline - Ultra Premium */}
            <div className="space-y-8">
              <h1 className="text-5xl sm:text-6xl lg:text-8xl font-black tracking-tight leading-[1.1]">
                <span className="text-white drop-shadow-2xl">
                  {accountInfo?.landingPageTitle?.split(' ').slice(0, 2).join(' ') || "Venda Mais"}
                </span>
                <br />
                <span className="relative">
                  <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent drop-shadow-2xl">
                    {accountInfo?.landingPageTitle?.split(' ').slice(2).join(' ') || "com Webinários Automáticos"}
                  </span>
                  {/* Underline decoration */}
                  <svg className="absolute -bottom-2 left-0 w-full h-3 text-cyan-500/30" viewBox="0 0 200 8" preserveAspectRatio="none">
                    <path d="M0 7 Q50 0, 100 7 T200 7" stroke="currentColor" strokeWidth="3" fill="none" />
                  </svg>
                </span>
              </h1>

              <p className="text-xl sm:text-2xl text-slate-300 max-w-3xl mx-auto leading-relaxed font-light">
                {accountInfo?.landingPageDescription ||
                  "Transforme seu conhecimento em vendas 24/7. Webinários profissionais que rodam no piloto automático enquanto você foca no que importa."}
              </p>
            </div>

            {/* Premium CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-5 justify-center pt-6">
              <Button
                size="lg"
                onClick={() => setLocation("/teste-gratis")}
                className="relative bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 bg-[length:200%_100%] hover:bg-[position:100%_0] transition-all duration-500 text-lg h-16 px-10 shadow-2xl shadow-blue-500/30 group rounded-2xl font-semibold"
                data-testid="button-hero-cta"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                <Rocket className="w-5 h-5 mr-2 group-hover:-translate-y-1 transition-transform" />
                Começar Gratuitamente
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>

            {/* Premium Trust Signals */}
            <div className="flex flex-wrap gap-8 sm:gap-14 justify-center pt-10">
              <div className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Shield className="w-5 h-5 text-green-400" />
                </div>
                <span className="text-slate-300 font-medium">Sem cartão de crédito</span>
              </div>
              <div className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Zap className="w-5 h-5 text-yellow-400" />
                </div>
                <span className="text-slate-300 font-medium">Setup em 5 minutos</span>
              </div>
              <div className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-slate-300 font-medium">Suporte em português</span>
              </div>
            </div>
          </div>

          {/* Premium Stats Bar */}
          <div className="mt-24 relative">
            {/* Stats background glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-cyan-500/5 to-purple-500/5 rounded-3xl blur-xl" />
            
            <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-slate-800/50 backdrop-blur-xl">
              {/* Stat 1 */}
              <div className="text-center p-4 sm:p-6 rounded-2xl hover:bg-slate-800/30 transition-colors group cursor-default">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Video className="w-7 h-7 text-blue-400" />
                </div>
                <div className="text-4xl sm:text-5xl font-black bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent mb-2">
                  10K+
                </div>
                <div className="text-sm text-slate-400 font-medium">Webinários Realizados</div>
              </div>
              
              {/* Stat 2 */}
              <div className="text-center p-4 sm:p-6 rounded-2xl hover:bg-slate-800/30 transition-colors group cursor-default">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Users className="w-7 h-7 text-cyan-400" />
                </div>
                <div className="text-4xl sm:text-5xl font-black bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent mb-2">
                  500+
                </div>
                <div className="text-sm text-slate-400 font-medium">Empresas Ativas</div>
              </div>
              
              {/* Stat 3 */}
              <div className="text-center p-4 sm:p-6 rounded-2xl hover:bg-slate-800/30 transition-colors group cursor-default">
                <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Star className="w-7 h-7 text-yellow-400" />
                </div>
                <div className="text-4xl sm:text-5xl font-black bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent mb-2">
                  98%
                </div>
                <div className="text-sm text-slate-400 font-medium">Taxa de Satisfação</div>
              </div>
              
              {/* Stat 4 */}
              <div className="text-center p-4 sm:p-6 rounded-2xl hover:bg-slate-800/30 transition-colors group cursor-default">
                <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Clock className="w-7 h-7 text-green-400" />
                </div>
                <div className="text-4xl sm:text-5xl font-black bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent mb-2">
                  24/7
                </div>
                <div className="text-sm text-slate-400 font-medium">Suporte Disponível</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Light gradient background */}
      <section className="relative py-24 overflow-hidden">
        {/* Light gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
        {/* Decorative light beams */}
        <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-blue-500/20 to-transparent" />
        <div className="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent" />
        <div className="absolute top-0 right-1/4 w-px h-full bg-gradient-to-b from-transparent via-purple-500/20 to-transparent" />
        {/* Horizontal light effect */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/10 to-transparent" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-blue-500/10 text-blue-400 border-blue-500/20">
              Recursos Poderosos
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Tudo para vender mais com webinários
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Recursos profissionais que normalmente custam milhares em outras plataformas
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-blue-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm">
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all">
                  <Video className="w-7 h-7 text-blue-400" />
                </div>
                <CardTitle className="text-white text-lg">Streaming HLS Premium</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">Qualidade de cinema com tecnologia adaptativa. Sem travamentos, sem buffering.</p>
              </CardContent>
            </Card>

            {/* Feature 2 */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-cyan-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm">
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-cyan-500/20 transition-all">
                  <Globe className="w-7 h-7 text-cyan-400" />
                </div>
                <CardTitle className="text-white text-lg">Seu Domínio, Sua Marca</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">Use seu próprio domínio. Zero marcas de terceiros. 100% profissional.</p>
              </CardContent>
            </Card>

            {/* Feature 3 */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-purple-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm">
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-purple-500/20 transition-all">
                  <Users className="w-7 h-7 text-purple-400" />
                </div>
                <CardTitle className="text-white text-lg">Chat Simulado Inteligente</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">Comentários automáticos sincronizados com o vídeo. Parecem 100% reais.</p>
              </CardContent>
            </Card>

            {/* Feature 4 */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-amber-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm">
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-amber-500/20 transition-all">
                  <Sparkles className="w-7 h-7 text-amber-400" />
                </div>
                <CardTitle className="text-white text-lg">Designer IA</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">IA sugere cores, textos e layouts. Personalize em segundos, não horas.</p>
              </CardContent>
            </Card>

            {/* Feature 5 */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-green-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm">
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-green-500/20 transition-all">
                  <Calendar className="w-7 h-7 text-green-400" />
                </div>
                <CardTitle className="text-white text-lg">Agendamento Automático</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">Configure uma vez, rode para sempre. Diário, semanal, mensal ou único.</p>
              </CardContent>
            </Card>

            {/* Feature 6 */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-red-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm">
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-red-500/20 transition-all">
                  <Target className="w-7 h-7 text-red-400" />
                </div>
                <CardTitle className="text-white text-lg">Captura de Leads</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">Formulários integrados. Exporte para seu CRM. Nunca perca um lead.</p>
              </CardContent>
            </Card>

            {/* Feature 7 - AI Script Generator - EXCLUSIVE */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-violet-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm relative overflow-hidden" data-testid="card-feature-script-generator">
              <div className="absolute top-2 right-2">
                <Badge className="bg-gradient-to-r from-violet-500 to-purple-500 text-white text-xs border-0" data-testid="badge-exclusive-ia-script">
                  <Bot className="w-3 h-3 mr-1" />
                  Exclusivo IA
                </Badge>
              </div>
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-violet-500/20 transition-all">
                  <FileText className="w-7 h-7 text-violet-400" />
                </div>
                <CardTitle className="text-white text-lg" data-testid="text-feature-script-generator">Gerador de Roteiro IA</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">IA cria roteiros completos de vendas a partir da transcrição do seu vídeo. Copy profissional em minutos.</p>
              </CardContent>
            </Card>

            {/* Feature 8 - AI Message Generator - EXCLUSIVE */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm relative overflow-hidden" data-testid="card-feature-message-generator">
              <div className="absolute top-2 right-2">
                <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs border-0" data-testid="badge-exclusive-ia-message">
                  <Bot className="w-3 h-3 mr-1" />
                  Exclusivo IA
                </Badge>
              </div>
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-emerald-500/20 transition-all">
                  <Mail className="w-7 h-7 text-emerald-400" />
                </div>
                <CardTitle className="text-white text-lg" data-testid="text-feature-message-generator">Gerador de Mensagens IA</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">Crie emails e WhatsApp personalizados para seus leads com IA. Comunicação que converte.</p>
              </CardContent>
            </Card>

            {/* Feature 9 - AI Transcription */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-rose-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm relative overflow-hidden" data-testid="card-feature-transcription">
              <div className="absolute top-2 right-2">
                <Badge className="bg-gradient-to-r from-rose-500 to-pink-500 text-white text-xs border-0" data-testid="badge-ia-transcription">
                  <Mic className="w-3 h-3 mr-1" />
                  IA
                </Badge>
              </div>
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500/30 to-pink-600/20 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-rose-500/20 transition-all">
                  <Mic className="w-7 h-7 text-rose-400" />
                </div>
                <CardTitle className="text-white text-lg" data-testid="text-feature-transcription">Transcrição Automática</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">IA transcreve seus vídeos automaticamente. Base para roteiros e mensagens inteligentes.</p>
              </CardContent>
            </Card>

            {/* Feature 10 - Email Marketing Automation - NEW */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-blue-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm relative overflow-hidden" data-testid="card-feature-email-automation">
              <div className="absolute top-2 right-2">
                <Badge className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs border-0" data-testid="badge-automation-email">
                  <Send className="w-3 h-3 mr-1" />
                  Automação
                </Badge>
              </div>
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-600/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all">
                  <Mail className="w-7 h-7 text-blue-400" />
                </div>
                <CardTitle className="text-white text-lg" data-testid="text-feature-email-automation">Sequência de Emails</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">Lembretes automáticos antes, durante e depois do webinar. Editor drag-and-drop profissional.</p>
              </CardContent>
            </Card>

            {/* Feature 11 - WhatsApp Marketing Automation - NEW */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-green-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm relative overflow-hidden" data-testid="card-feature-whatsapp-automation">
              <div className="absolute top-2 right-2">
                <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs border-0" data-testid="badge-automation-whatsapp">
                  <SiWhatsapp className="w-3 h-3 mr-1" />
                  Automação
                </Badge>
              </div>
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-600/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-green-500/20 transition-all">
                  <SiWhatsapp className="w-7 h-7 text-green-400" />
                </div>
                <CardTitle className="text-white text-lg" data-testid="text-feature-whatsapp-automation">WhatsApp Marketing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">Envie mensagens, imagens e vídeos automáticos. Lembretes sincronizados com o webinar.</p>
              </CardContent>
            </Card>

            {/* Feature - AI WhatsApp Agent - NEW EXCLUSIVE */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-green-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm relative overflow-hidden ring-1 ring-green-500/30" data-testid="card-feature-whatsapp-ai-agent">
              <div className="absolute top-2 right-2">
                <Badge className="bg-gradient-to-r from-green-500 to-teal-500 text-white text-xs border-0" data-testid="badge-exclusive-whatsapp-ai">
                  <Bot className="w-3 h-3 mr-1" />
                  IA + Exclusivo
                </Badge>
              </div>
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/30 to-teal-600/20 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-green-500/20 transition-all">
                  <Bot className="w-7 h-7 text-green-400" />
                </div>
                <CardTitle className="text-white text-lg" data-testid="text-feature-whatsapp-ai-agent">Agente IA WhatsApp</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">IA que responde seus leads no WhatsApp 24/7. Atendimento inteligente, independente dos webinars.</p>
              </CardContent>
            </Card>

            {/* Feature 12 - Reminder Sequences - NEW */}
            <Card className="bg-slate-800/40 border-slate-700/50 hover:border-orange-500/50 hover:bg-slate-800/60 transition-all duration-300 group backdrop-blur-sm relative overflow-hidden" data-testid="card-feature-reminders">
              <div className="absolute top-2 right-2">
                <Badge className="bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs border-0" data-testid="badge-reminders">
                  <Bell className="w-3 h-3 mr-1" />
                  Lembretes
                </Badge>
              </div>
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-600/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-orange-500/20 transition-all">
                  <Bell className="w-7 h-7 text-orange-400" />
                </div>
                <CardTitle className="text-white text-lg" data-testid="text-feature-reminders">Lembretes Inteligentes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm leading-relaxed">Sequências antes, durante e depois do webinar. Email + WhatsApp sincronizados automaticamente.</p>
              </CardContent>
            </Card>
          </div>

          {/* AI Differentiator Highlight */}
          <div className="mt-12 text-center" data-testid="section-ai-differentiator">
            <div className="inline-flex flex-col sm:flex-row items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-violet-500/10 via-green-500/10 to-teal-500/10 border border-violet-500/20 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Bot className="w-6 h-6 text-violet-400" />
                <span className="text-violet-300 font-semibold" data-testid="text-ai-exclusive">Exclusivo AutoWebinar:</span>
              </div>
              <span className="text-slate-200 text-sm text-center sm:text-left">
                Geradores de Copy IA + <strong className="text-green-300">Agente IA WhatsApp 24/7</strong> em todos os planos
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Gradient mesh background */}
      <section className="relative py-24 overflow-hidden">
        {/* Gradient mesh background - lighter feel */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950/30 to-slate-900" />
        {/* Animated glow orbs */}
        <div className="absolute top-1/4 left-0 w-[500px] h-[500px] bg-green-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 right-0 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">
              Simples de Usar
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Comece a vender em 4 passos
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              Configure seu primeiro webinário em menos de 10 minutos. Sem conhecimento técnico, sem complicação.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4">
            {/* Step 1 */}
            <div className="relative group">
              <Card className="bg-white/5 border-white/10 hover:border-blue-500/50 hover:bg-white/10 transition-all duration-300 relative z-10 backdrop-blur-sm">
                <CardContent className="pt-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-500/30 group-hover:scale-110 group-hover:shadow-2xl group-hover:shadow-blue-500/40 transition-all">
                    <span className="text-2xl font-bold text-white">1</span>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-3">
                    <Rocket className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Crie sua conta</h3>
                  <p className="text-slate-300 text-sm mb-4">Cadastro em 30 segundos, sem cartão de crédito</p>
                  <ul className="text-left space-y-2">
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Email e senha</span>
                    </li>
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Confirmação instantânea</span>
                    </li>
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Acesso imediato ao painel</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Step 2 */}
            <div className="relative group">
              <Card className="bg-white/5 border-white/10 hover:border-cyan-500/50 hover:bg-white/10 transition-all duration-300 relative z-10 backdrop-blur-sm">
                <CardContent className="pt-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-cyan-500/30 group-hover:scale-110 group-hover:shadow-2xl group-hover:shadow-cyan-500/40 transition-all">
                    <span className="text-2xl font-bold text-white">2</span>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center mx-auto mb-3">
                    <Upload className="w-6 h-6 text-cyan-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Suba seu vídeo</h3>
                  <p className="text-slate-300 text-sm mb-4">Upload simples com conversão automática</p>
                  <ul className="text-left space-y-2">
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Arraste e solte o arquivo</span>
                    </li>
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Conversão HLS automática</span>
                    </li>
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Otimizado para streaming</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Step 3 */}
            <div className="relative group">
              <Card className="bg-white/5 border-white/10 hover:border-purple-500/50 hover:bg-white/10 transition-all duration-300 relative z-10 backdrop-blur-sm">
                <CardContent className="pt-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-purple-500/30 group-hover:scale-110 group-hover:shadow-2xl group-hover:shadow-purple-500/40 transition-all">
                    <span className="text-2xl font-bold text-white">3</span>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-3">
                    <Settings className="w-6 h-6 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Configure tudo</h3>
                  <p className="text-slate-300 text-sm mb-4">Ofertas, banner, chat e automações</p>
                  <ul className="text-left space-y-2">
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Oferta e banner de CTA</span>
                    </li>
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Comentários e agendamento</span>
                    </li>
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Email e WhatsApp automático</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Step 4 */}
            <div className="relative group">
              <Card className="bg-white/5 border-white/10 hover:border-green-500/50 hover:bg-white/10 transition-all duration-300 relative z-10 backdrop-blur-sm">
                <CardContent className="pt-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-green-500/30 group-hover:scale-110 group-hover:shadow-2xl group-hover:shadow-green-500/40 transition-all">
                    <span className="text-2xl font-bold text-white">4</span>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                    <TrendingUp className="w-6 h-6 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Comece a vender</h3>
                  <p className="text-slate-300 text-sm mb-4">Leads e vendas no piloto automático</p>
                  <ul className="text-left space-y-2">
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Compartilhe o link</span>
                    </li>
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Capture leads automático</span>
                    </li>
                    <li className="flex items-start gap-2 text-slate-300 text-xs">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>Venda 24/7 sem esforço</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Extra detail: Time estimate */}
          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
              <Clock className="w-5 h-5 text-cyan-400" />
              <span className="text-slate-200 text-sm">Tempo médio de configuração: <strong className="text-white">menos de 10 minutos</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Section - Why AutoWebinar is Better */}
      <section className="relative py-24 overflow-hidden" data-testid="section-comparison">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-violet-950/20 to-slate-950" />
        <div className="absolute top-1/2 left-0 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-[150px]" />
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[120px]" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-violet-500/10 text-violet-400 border-violet-500/20" data-testid="badge-comparison">
              <Bot className="w-3 h-3 mr-1" />
              Comparativo
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" data-testid="text-comparison-title">
              Por que escolher o AutoWebinar?
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto" data-testid="text-comparison-subtitle">
              Somos a única plataforma brasileira com geradores de copy IA integrados
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm overflow-hidden" data-testid="card-comparison-table">
              <div>
                <table className="w-full" data-testid="table-comparison">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left p-2 sm:p-4 text-slate-300 font-medium text-xs sm:text-base">Recurso</th>
                      <th className="p-2 sm:p-4 text-center w-16 sm:w-24">
                        <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                          <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                            <Zap className="w-3 h-3 sm:w-5 sm:h-5 text-white" />
                          </div>
                          <span className="text-white font-bold text-[10px] sm:text-sm">Nós</span>
                        </div>
                      </th>
                      <th className="p-2 sm:p-4 text-center w-14 sm:w-24">
                        <span className="text-slate-400 text-[10px] sm:text-sm">Outros</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-2 sm:p-4 text-slate-200 text-xs sm:text-base">Webinários Automatizados</td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-slate-500 mx-auto" /></td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-2 sm:p-4 text-slate-200 text-xs sm:text-base">Chat Simulado Inteligente</td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-slate-500 mx-auto" /></td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-2 sm:p-4 text-slate-200 text-xs sm:text-base">Streaming HLS Adaptativo</td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-slate-500 mx-auto" /></td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-2 sm:p-4 text-slate-200 text-xs sm:text-base">Captura de Leads</td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-slate-500 mx-auto" /></td>
                    </tr>
                    <tr className="bg-violet-500/10 hover:bg-violet-500/15 transition-colors">
                      <td className="p-2 sm:p-4">
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                          <div className="flex items-center gap-1 sm:gap-2">
                            <FileText className="w-3 h-3 sm:w-5 sm:h-5 text-violet-400 flex-shrink-0" />
                            <span className="text-white font-medium text-xs sm:text-base">Roteiro IA</span>
                          </div>
                          <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 text-[10px] sm:text-xs w-fit px-1 py-0 sm:px-2 sm:py-0.5">Exclusivo</Badge>
                        </div>
                      </td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><X className="w-4 h-4 text-red-400 mx-auto" /></td>
                    </tr>
                    <tr className="bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors">
                      <td className="p-2 sm:p-4">
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                          <div className="flex items-center gap-1 sm:gap-2">
                            <Mail className="w-3 h-3 sm:w-5 sm:h-5 text-emerald-400 flex-shrink-0" />
                            <span className="text-white font-medium text-xs sm:text-base">Mensagens IA</span>
                          </div>
                          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] sm:text-xs w-fit px-1 py-0 sm:px-2 sm:py-0.5">Exclusivo</Badge>
                        </div>
                      </td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><X className="w-4 h-4 text-red-400 mx-auto" /></td>
                    </tr>
                    <tr className="bg-rose-500/10 hover:bg-rose-500/15 transition-colors">
                      <td className="p-2 sm:p-4">
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                          <div className="flex items-center gap-1 sm:gap-2">
                            <Mic className="w-3 h-3 sm:w-5 sm:h-5 text-rose-400 flex-shrink-0" />
                            <span className="text-white font-medium text-xs sm:text-base">Transcrição IA</span>
                          </div>
                          <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[10px] sm:text-xs w-fit px-1 py-0 sm:px-2 sm:py-0.5">Exclusivo</Badge>
                        </div>
                      </td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><X className="w-4 h-4 text-red-400 mx-auto" /></td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-2 sm:p-4 text-slate-200 text-xs sm:text-base">Designer IA</td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><X className="w-4 h-4 text-red-400 mx-auto" /></td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-2 sm:p-4 text-slate-200 text-xs sm:text-base">Pagamento em Real</td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><X className="w-4 h-4 text-red-400 mx-auto" /></td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-2 sm:p-4 text-slate-200 text-xs sm:text-base">Suporte em Português</td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><X className="w-4 h-4 text-red-400 mx-auto" /></td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-2 sm:p-4 text-slate-200 text-xs sm:text-base">Email Marketing</td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-slate-500 mx-auto" /></td>
                    </tr>
                    <tr className="bg-green-500/10 hover:bg-green-500/15 transition-colors">
                      <td className="p-2 sm:p-4">
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                          <div className="flex items-center gap-1 sm:gap-2">
                            <SiWhatsapp className="w-3 h-3 sm:w-5 sm:h-5 text-green-400 flex-shrink-0" />
                            <span className="text-white font-medium text-xs sm:text-base">WhatsApp</span>
                          </div>
                          <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-[10px] sm:text-xs w-fit px-1 py-0 sm:px-2 sm:py-0.5">Exclusivo</Badge>
                        </div>
                      </td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><X className="w-4 h-4 text-red-400 mx-auto" /></td>
                    </tr>
                    <tr className="bg-orange-500/10 hover:bg-orange-500/15 transition-colors">
                      <td className="p-2 sm:p-4">
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                          <div className="flex items-center gap-1 sm:gap-2">
                            <Bell className="w-3 h-3 sm:w-5 sm:h-5 text-orange-400 flex-shrink-0" />
                            <span className="text-white font-medium text-xs sm:text-base">Lembretes</span>
                          </div>
                          <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-[10px] sm:text-xs w-fit px-1 py-0 sm:px-2 sm:py-0.5">Exclusivo</Badge>
                        </div>
                      </td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><X className="w-4 h-4 text-red-400 mx-auto" /></td>
                    </tr>
                    <tr className="bg-teal-500/10 hover:bg-teal-500/15 transition-colors">
                      <td className="p-2 sm:p-4">
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                          <div className="flex items-center gap-1 sm:gap-2">
                            <Bot className="w-3 h-3 sm:w-5 sm:h-5 text-teal-400 flex-shrink-0" />
                            <span className="text-white font-medium text-xs sm:text-base">Agente IA WhatsApp</span>
                          </div>
                          <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 text-[10px] sm:text-xs w-fit px-1 py-0 sm:px-2 sm:py-0.5">Novo</Badge>
                        </div>
                      </td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><X className="w-4 h-4 text-red-400 mx-auto" /></td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-2 sm:p-4 text-slate-200 text-xs sm:text-base">Domínio Próprio</td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-green-400 mx-auto" /></td>
                      <td className="p-2 sm:p-4 text-center"><Check className="w-4 h-4 text-slate-500 mx-auto" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            {/* AI & Automation Summary */}
            <div className="mt-8 text-center px-4">
              <div className="inline-flex flex-col sm:flex-row items-center gap-3 sm:gap-4 px-4 sm:px-8 py-4 sm:py-5 rounded-2xl bg-gradient-to-r from-violet-500/10 via-teal-500/10 to-green-500/10 border border-teal-500/20 backdrop-blur-sm max-w-full">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-teal-500 to-green-600 flex items-center justify-center shadow-lg shadow-teal-500/30 flex-shrink-0">
                    <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="text-white font-semibold text-sm sm:text-base">Agente IA WhatsApp</div>
                    <div className="text-slate-400 text-xs sm:text-sm">Atendimento 24/7 automático</div>
                  </div>
                </div>
                <div className="hidden sm:block w-px h-10 bg-white/10" />
                <div className="text-slate-300 text-xs sm:text-sm max-w-xs text-center sm:text-left">
                  <strong className="text-teal-300">IA responde seus leads</strong> independente dos webinars, em todos os planos
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section - With purple glow */}
      <section id="pricing" className="relative py-24 overflow-hidden">
        {/* Background with spotlight effect */}
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] bg-blue-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-cyan-500/10 rounded-full blur-[100px]" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-purple-500/10 text-purple-400 border-purple-500/20">
              Preços Transparentes
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Escolha o plano ideal para você
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              Comece pequeno, cresça com a gente. Upgrade ou downgrade a qualquer momento.
            </p>
          </div>

          {isLoadingPlanos ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : planosError ? (
            <div className="text-center py-12">
              <p className="text-slate-400">Não foi possível carregar os planos.</p>
              <Button
                onClick={() => setLocation("/login")}
                className="mt-4 bg-gradient-to-r from-blue-600 to-cyan-600"
              >
                Entrar na Plataforma
              </Button>
            </div>
          ) : planosAtivos.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {planosAtivos.map((plano) => {
                const beneficios = getBeneficios(plano.beneficios);
                const isPopular = plano.destaque;
                
                return (
                  <Card 
                    key={plano.id} 
                    className={`relative bg-white/5 border-white/10 overflow-hidden transition-all duration-300 hover:scale-105 backdrop-blur-sm ${
                      isPopular ? 'border-blue-500/50 shadow-2xl shadow-blue-500/20 ring-1 ring-blue-500/30' : 'hover:border-white/20'
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-center py-2 text-sm font-medium">
                        <Crown className="w-4 h-4 inline mr-1" />
                        Mais Popular
                      </div>
                    )}
                    
                    <CardHeader className={isPopular ? 'pt-14' : ''}>
                      <CardTitle className="text-white text-xl">{plano.nome}</CardTitle>
                      <CardDescription className="text-slate-300">
                        {plano.descricao || `${plano.prazoDias} dias de acesso`}
                      </CardDescription>
                      <div className="pt-4">
                        <span className="text-5xl font-black bg-gradient-to-br from-white to-slate-300 bg-clip-text text-transparent">{formatCurrency(plano.preco)}</span>
                        {plano.tipoCobranca === 'recorrente' ? (
                          <span className="text-slate-400 text-sm ml-1">
                            /{plano.frequenciaTipo === 'months' ? 'mês' : plano.frequenciaTipo === 'years' ? 'ano' : 'dia'}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm ml-1">/único</span>
                        )}
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-slate-200">
                          <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                          <span>{plano.webinarLimit >= 999 ? 'Webinários ilimitados' : `${plano.webinarLimit} webinários`}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-200">
                          <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                          <span>{plano.storageLimit || 5}GB de armazenamento</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-200">
                          <SiWhatsapp className="w-5 h-5 text-green-400 flex-shrink-0" />
                          <span>{(plano.whatsappAccountLimit ?? 2) >= 999 ? 'Conexões WhatsApp ilimitadas' : `${plano.whatsappAccountLimit ?? 2} conexões WhatsApp`}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-200">
                          <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                          <span>Visualizações ilimitadas</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-200">
                          <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                          <span>Leads capturados ilimitados</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-200">
                          <Globe className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                          <span>Domínio customizado incluso</span>
                        </div>
                        {plano.webinarLimit > 5 ? (
                          <div className="flex items-center gap-2 text-slate-200">
                            <Play className="w-5 h-5 text-purple-400 flex-shrink-0" />
                            <span>Replay automático</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-slate-400">
                            <X className="w-5 h-5 text-slate-500 flex-shrink-0" />
                            <span className="line-through">Replay automático</span>
                            <Badge variant="outline" className="ml-1 text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">Pro+</Badge>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-slate-200">
                          <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
                          <span>Ofertas cronometradas</span>
                        </div>
                        
                        {/* Automation Features Highlight */}
                        <div className="pt-2 pb-1">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Send className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Automação Completa</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-200">
                            <Mail className="w-5 h-5 text-blue-400 flex-shrink-0" />
                            <span>Sequência de Emails</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-200 mt-2">
                            <SiWhatsapp className="w-5 h-5 text-green-400 flex-shrink-0" />
                            <span>WhatsApp Marketing</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-200 mt-2">
                            <Bell className="w-5 h-5 text-orange-400 flex-shrink-0" />
                            <span>Lembretes automáticos</span>
                          </div>
                        </div>
                        
                        {/* AI Features Highlight */}
                        <div className="pt-2 pb-1">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Bot className="w-4 h-4 text-violet-400" />
                            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wide">Ferramentas IA</span>
                          </div>
                          {plano.webinarLimit > 5 ? (
                            <div className="flex items-center gap-2 text-slate-200">
                              <Sparkles className="w-5 h-5 text-violet-400 flex-shrink-0" />
                              <span>Gerador de Roteiro IA</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-400">
                              <X className="w-5 h-5 text-slate-500 flex-shrink-0" />
                              <span className="line-through">Gerador de Roteiro IA</span>
                              <Badge variant="outline" className="ml-1 text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">Pro+</Badge>
                            </div>
                          )}
                          {plano.webinarLimit > 5 ? (
                            <div className="flex items-center gap-2 text-slate-200 mt-2">
                              <Mic className="w-5 h-5 text-rose-400 flex-shrink-0" />
                              <span>Transcrição Automática</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-400 mt-2">
                              <X className="w-5 h-5 text-slate-500 flex-shrink-0" />
                              <span className="line-through">Transcrição Automática</span>
                              <Badge variant="outline" className="ml-1 text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">Pro+</Badge>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-slate-200 mt-2">
                            <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                            <span>Chat simulado inteligente</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-200 mt-2">
                            <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                            <span>Agendamento automático</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-200 mt-2">
                            <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                            <span>Designer IA</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-200 mt-2">
                            <Bot className="w-5 h-5 text-teal-400 flex-shrink-0" />
                            <span>Agente IA WhatsApp</span>
                            <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 text-[10px]">Novo</Badge>
                          </div>
                        </div>
                        
                        {beneficios
                          .filter((b: string) => 
                            !b.toLowerCase().includes('suporte por email') &&
                            !b.toLowerCase().includes('suporte prioritário') &&
                            !b.toLowerCase().includes('api de integração') &&
                            !b.toLowerCase().includes('gerente de conta') &&
                            !b.toLowerCase().includes('domínio') &&
                            !b.toLowerCase().includes('replay automático') &&
                            !b.toLowerCase().includes('ofertas cronometradas') &&
                            !b.toLowerCase().includes('gerador de roteiro') &&
                            !b.toLowerCase().includes('transcrição automática') &&
                            !b.toLowerCase().includes('chat simulado') &&
                            !b.toLowerCase().includes('agendamento automático') &&
                            !b.toLowerCase().includes('designer ia') &&
                            !b.toLowerCase().includes('sequência de emails') &&
                            !b.toLowerCase().includes('whatsapp') &&
                            !b.toLowerCase().includes('lembretes automáticos')
                          )
                          .map((beneficio: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-slate-200">
                            <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                            <span>{beneficio}</span>
                          </div>
                        ))}
                      </div>
                      
                      <Button
                        onClick={() => setLocation(`/checkout/${plano.id}`)}
                        className={`w-full h-12 text-base font-medium ${
                          isPopular 
                            ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-500/25' 
                            : 'bg-white/10 hover:bg-white/20 border border-white/10'
                        }`}
                        data-testid={`button-plan-${plano.id}`}
                      >
                        {isPopular ? 'Começar Agora' : 'Escolher Plano'}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-slate-400">Planos serão exibidos em breve.</p>
              <Button
                onClick={() => setLocation("/login")}
                className="mt-4 bg-gradient-to-r from-blue-600 to-cyan-600"
              >
                Entrar na Plataforma
              </Button>
            </div>
          )}

          {/* Money Back Guarantee */}
          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-green-500/10 border border-green-500/20 backdrop-blur-sm">
              <Shield className="w-6 h-6 text-green-400" />
              <span className="text-green-300 font-medium">Garantia de 7 dias ou seu dinheiro de volta</span>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials - Warm gradient */}
      <section className="relative py-24 overflow-hidden">
        {/* Warm background */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-amber-950/10 to-slate-950" />
        <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-orange-500/5 rounded-full blur-[120px]" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-amber-500/10 text-amber-400 border-amber-500/20">
              Depoimentos
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              O que nossos clientes dizem
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <Card className="bg-white/5 border-white/10 hover:border-amber-500/30 transition-all duration-300 backdrop-blur-sm group">
              <CardContent className="pt-6">
                <div className="flex items-center gap-1 mb-4">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-200 mb-6 italic leading-relaxed">"Triplicamos nossas vendas com os webinários automáticos. A plataforma é simplesmente incrível!"</p>
                <div className="flex items-center gap-3">
                  <img 
                    src={carlosSilvaImg} 
                    alt="Carlos Silva" 
                    className="w-12 h-12 rounded-full object-cover border-2 border-amber-500/30 group-hover:border-amber-400/50 transition-colors"
                  />
                  <div>
                    <div className="text-white font-medium">Carlos Silva</div>
                    <div className="text-slate-400 text-sm">Infoprodutor</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Testimonial 2 */}
            <Card className="bg-white/5 border-white/10 hover:border-amber-500/30 transition-all duration-300 backdrop-blur-sm group">
              <CardContent className="pt-6">
                <div className="flex items-center gap-1 mb-4">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-200 mb-6 italic leading-relaxed">"Finalmente uma ferramenta brasileira que entende nossas necessidades. Suporte nota 10!"</p>
                <div className="flex items-center gap-3">
                  <img 
                    src={anaPaulaImg} 
                    alt="Ana Paula" 
                    className="w-12 h-12 rounded-full object-cover border-2 border-amber-500/30 group-hover:border-amber-400/50 transition-colors"
                  />
                  <div>
                    <div className="text-white font-medium">Ana Paula</div>
                    <div className="text-slate-400 text-sm">Coach de Vendas</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Testimonial 3 */}
            <Card className="bg-white/5 border-white/10 hover:border-amber-500/30 transition-all duration-300 backdrop-blur-sm group">
              <CardContent className="pt-6">
                <div className="flex items-center gap-1 mb-4">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-200 mb-6 italic leading-relaxed">"Usamos para todos os nossos clientes. A automação economiza horas de trabalho por semana."</p>
                <div className="flex items-center gap-3">
                  <img 
                    src={robertoMendesImg} 
                    alt="Roberto Mendes" 
                    className="w-12 h-12 rounded-full object-cover border-2 border-amber-500/30 group-hover:border-amber-400/50 transition-colors"
                  />
                  <div>
                    <div className="text-white font-medium">Roberto Mendes</div>
                    <div className="text-slate-400 text-sm">Agência Digital</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* About Section - With blue glow */}
      <section id="sobre" className="relative py-24 overflow-hidden">
        {/* Background with blue glow */}
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[120px]" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="mb-4 bg-blue-500/10 text-blue-400 border-blue-500/20">
                Sobre Nós
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                Transformando a forma como você vende online
              </h2>
              <div className="space-y-4 text-slate-300">
                <p>
                  O <strong className="text-white">AutoWebinar</strong> nasceu da necessidade de democratizar o acesso a ferramentas profissionais de webinários automáticos no Brasil.
                </p>
                <p>
                  Nossa missão é ajudar empreendedores, infoprodutores e empresas a escalarem suas vendas através de apresentações automatizadas de alta qualidade, sem depender de tecnologia complicada ou equipes técnicas.
                </p>
                <p>
                  Com tecnologia de streaming HLS, chat simulado inteligente e integração com os principais meios de pagamento do Brasil, oferecemos tudo que você precisa para vender no piloto automático.
                </p>
              </div>
              
              <div className="mt-8 grid grid-cols-2 gap-6">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
                  <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-1">100%</div>
                  <div className="text-sm text-slate-300">Brasileiro</div>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
                  <div className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent mb-1">24/7</div>
                  <div className="text-sm text-slate-300">Suporte dedicado</div>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-3xl blur-3xl" />
              <Card className="relative bg-white/5 border-white/10 p-8 backdrop-blur-sm">
                <div className="text-center mb-6">
                  <img 
                    src={logoAutoWebinar} 
                    alt="AutoWebinar" 
                    className="h-16 w-auto mx-auto mb-4"
                  />
                  <h3 className="text-xl font-semibold text-white">Entre em Contato</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-sm text-slate-400">Email</div>
                      <a href="mailto:contato@autowebinar.com.br" className="text-white hover:text-blue-400 transition-colors">
                        contato@autowebinar.com.br
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <div className="text-sm text-slate-400">Horário de Atendimento</div>
                      <div className="text-white">Seg-Sex, 9h às 18h</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <div className="text-sm text-slate-400">Localização</div>
                      <div className="text-white">Brasil</div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA - Gradient mesh */}
      <section className="relative py-20 overflow-hidden">
        {/* Gradient mesh background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950/20 to-slate-900" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-blue-500/10 rounded-full blur-[100px]" />
        
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="p-8 sm:p-12 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Pronto para transformar suas vendas?
            </h2>
            <p className="text-lg text-slate-300 mb-8 max-w-2xl mx-auto">
              Junte-se a centenas de empresas que já estão vendendo mais com webinários automáticos.
            </p>
            <Button
              size="lg"
              onClick={() => setLocation("/register")}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-lg h-14 px-12 shadow-xl shadow-blue-500/25"
              data-testid="button-final-cta"
            >
              Começar Agora - É Grátis
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <p className="text-slate-400 text-sm mt-4">
              Sem cartão de crédito. Cancele quando quiser.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 bg-slate-950/80 mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="mb-4">
                <img 
                  src={logoAutoWebinar} 
                  alt={accountInfo?.name || "AutoWebinar"} 
                  className="h-10 w-auto"
                />
              </div>
              <p className="text-slate-400 text-sm">
                A plataforma brasileira de webinários automáticos mais completa do mercado.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Produto</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><button onClick={() => setLocation("/login")} className="hover:text-white transition-colors">Dashboard</button></li>
                <li><button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Preços</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Empresa</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><button onClick={() => document.getElementById('sobre')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Sobre</button></li>
                <li><a href="mailto:contato@autowebinar.com.br" className="hover:text-white transition-colors">contato@autowebinar.com.br</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><button onClick={() => setLocation("/politica-de-privacidade")} className="hover:text-white transition-colors" data-testid="link-privacy">Política de Privacidade</button></li>
                <li><button onClick={() => setLocation("/termos-de-servico")} className="hover:text-white transition-colors" data-testid="link-terms">Termos de Serviço</button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800/50 pt-8 text-center text-slate-500 text-sm">
            <p>© {new Date().getFullYear()} {accountInfo?.name || "AutoWebinar"}. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
