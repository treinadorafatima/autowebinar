import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Check, Star, Lock, ArrowRight, Zap, Video, Upload, Shield, Clock, Sparkles, CreditCard, QrCode, Barcode, RefreshCw, CheckCircle2, ShieldCheck, Bolt, Mail, Bell, Globe, Send, Mic, Bot, Play, X } from "lucide-react";
import { SiMercadopago, SiStripe, SiVisa, SiMastercard, SiWhatsapp } from "react-icons/si";
import { usePixel } from "@/hooks/use-pixel";
import logoImage from "@assets/logo-autowebinar_1764484003666.png";
import { initMercadoPago, Payment, CardPayment } from '@mercadopago/sdk-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

interface Plano {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  prazoDias: number;
  webinarLimit: number;
  uploadLimit?: number;
  storageLimit?: number;
  whatsappAccountLimit?: number;
  gateway: string;
  beneficios: string;
  destaque: boolean;
  tipoCobranca?: string;
  disponivelRenovacao?: boolean;
}

interface GatewayConfig {
  mercadopagoPublicKey?: string;
  stripePublicKey?: string;
}

interface UserInfo {
  email: string;
  name: string;
  role?: string;
  cpf?: string;
  telefone?: string;
}

interface UserSubscriptionInfo {
  plano: {
    id: string;
    nome: string;
    preco: number;
    storageLimit: number;
  } | null;
  assinatura: {
    status: string;
    plan?: {
      id: string;
      nome: string;
      preco: number;
      storageLimit: number;
    };
  } | null;
}

function StripeCheckoutForm({ 
  onSuccess, 
  onError,
  isProcessing,
  setIsProcessing 
}: { 
  onSuccess: () => void; 
  onError: (error: string) => void;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/pagamento/sucesso?gateway=stripe`,
      },
    });

    if (error) {
      onError(error.message || 'Erro ao processar pagamento');
      setIsProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full bg-[#635bff] hover:bg-[#5851ea] text-white py-6 text-lg font-semibold"
        data-testid="button-stripe-pay"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Processando...
          </>
        ) : (
          <>
            <Lock className="w-5 h-5 mr-2" />
            Pagar
          </>
        )}
      </Button>
    </form>
  );
}

export default function Checkout() {
  const { planoId } = useParams<{ planoId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { trackViewContent, trackInitiateCheckout, trackPurchase } = usePixel();
  
  // Get URL params for renewal flow
  const urlParams = new URLSearchParams(window.location.search);
  const emailFromUrl = urlParams.get("email") || "";
  const nomeFromUrl = urlParams.get("nome") || "";
  const isRenovacao = urlParams.get("renovacao") === "true";
  
  const [formData, setFormData] = useState({
    nome: nomeFromUrl,
    email: emailFromUrl,
    tipoDocumento: "CPF" as "CPF" | "CNPJ",
    documento: "",
    telefone: "",
  });
  const [step, setStep] = useState<"form" | "payment">("form");
  const [pagamentoId, setPagamentoId] = useState<string | null>(null);
  const [mpInitialized, setMpInitialized] = useState(false);
  const [stripePromise, setStripePromise] = useState<any>(null);
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [mpInitPoint, setMpInitPoint] = useState<string | null>(null);

  const { data: planos, isLoading: loadingPlanos } = useQuery<Plano[]>({
    queryKey: ["/api/checkout/planos/ativos"],
  });

  // Buscar plano específico diretamente quando acessado via link (para planos avulsos/teste)
  const { data: directPlano, isLoading: loadingDirectPlano } = useQuery<Plano>({
    queryKey: ["/api/checkout/planos", planoId],
    enabled: !!planoId,
  });

  const { data: gatewayConfig } = useQuery<GatewayConfig>({
    queryKey: ["/api/checkout/public-config"],
  });

  // Fetch logged-in user data
  const { data: currentUser } = useQuery<UserInfo>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  // Fetch user's current subscription
  const { data: userSubscription } = useQuery<UserSubscriptionInfo>({
    queryKey: ["/api/admin/subscription"],
    enabled: !!currentUser,
    retry: false,
  });

  // Normalize plan from either plano or assinatura.plan
  const currentUserPlano = userSubscription?.plano ?? userSubscription?.assinatura?.plan ?? null;
  const isUserLoggedIn = !!currentUser;

  // Usar plano buscado diretamente (funciona para planos avulsos) ou da lista
  const selectedPlano = planoId 
    ? (directPlano || planos?.find((p) => p.id === planoId)) 
    : null;

  useEffect(() => {
    if (gatewayConfig?.mercadopagoPublicKey && !mpInitialized) {
      initMercadoPago(gatewayConfig.mercadopagoPublicKey, { locale: 'pt-BR' });
      setMpInitialized(true);
    }
    if (gatewayConfig?.stripePublicKey && !stripePromise) {
      setStripePromise(loadStripe(gatewayConfig.stripePublicKey));
    }
  }, [gatewayConfig, mpInitialized, stripePromise]);

  useEffect(() => {
    if (selectedPlano) {
      trackViewContent({
        content_name: selectedPlano.nome,
        content_ids: [selectedPlano.id],
        value: selectedPlano.preco,
      });
    }
  }, [selectedPlano, trackViewContent]);

  // Pre-fill form with logged-in user data (fill each field only if empty)
  useEffect(() => {
    if (currentUser) {
      setFormData(prev => ({
        nome: prev.nome || currentUser.name || "",
        email: prev.email || currentUser.email || "",
        tipoDocumento: prev.tipoDocumento || "CPF",
        documento: prev.documento || currentUser.cpf || "",
        telefone: prev.telefone || currentUser.telefone || "",
      }));
    }
  }, [currentUser]);

  // Helper function to determine button text and action type for each plan
  const getButtonInfo = (plano: Plano) => {
    if (!isUserLoggedIn || !currentUserPlano) {
      return { text: "Começar Agora", type: "new" as const };
    }
    
    if (plano.id === currentUserPlano.id) {
      return { text: "Renovar", type: "renew" as const };
    }
    
    if (plano.preco > currentUserPlano.preco) {
      return { text: "Fazer Upgrade", type: "upgrade" as const };
    }
    
    return { text: "Começar Agora", type: "new" as const };
  };

  const iniciarMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlano) throw new Error("Selecione um plano");
      const res = await apiRequest("POST", `/api/checkout/iniciar/${selectedPlano.id}`, formData);
      return res.json();
    },
    onSuccess: (data: any) => {
      setPagamentoId(data.pagamentoId);
      setStep("payment");
      setIsRecurring(data.isRecurring || false);
      
      trackInitiateCheckout({
        value: selectedPlano?.preco,
        currency: "BRL",
        content_name: selectedPlano?.nome,
      });

      if (data.gateway === "stripe" && data.clientSecret) {
        setStripeClientSecret(data.clientSecret);
      }
      
      // For Mercado Pago recurring subscriptions, use redirect link
      if (data.gateway === "mercadopago" && data.mpInitPoint) {
        setMpInitPoint(data.mpInitPoint);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao iniciar checkout",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-start checkout when CPF/CNPJ and telefone are complete
  const hasAutoStartedRef = useRef(false);
  useEffect(() => {
    if (step !== "form" || hasAutoStartedRef.current || iniciarMutation.isPending) return;
    if (!formData.nome || !formData.email || !formData.telefone || !selectedPlano) return;
    
    const docDigits = formData.documento.replace(/\D/g, '');
    const isDocComplete = formData.tipoDocumento === "CPF" 
      ? docDigits.length === 11 
      : docDigits.length === 14;
    
    const phoneDigits = formData.telefone.replace(/\D/g, '');
    const isPhoneComplete = phoneDigits.length >= 10;
    
    if (isDocComplete && isPhoneComplete) {
      hasAutoStartedRef.current = true;
      iniciarMutation.mutate();
    }
  }, [formData.documento, formData.tipoDocumento, formData.nome, formData.email, formData.telefone, step, selectedPlano, iniciarMutation]);

  const processarPagamentoMpMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      const res = await apiRequest("POST", "/api/checkout/mercadopago/processar", {
        pagamentoId,
        paymentData,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.status === 'approved') {
        if (selectedPlano) {
          trackPurchase({
            value: selectedPlano.preco,
            currency: "BRL",
            content_name: selectedPlano.nome,
          });
        }
        setLocation('/pagamento/sucesso?gateway=mercadopago');
      } else if (data.status === 'pending' || data.status === 'in_process') {
        setLocation('/pagamento/pendente?gateway=mercadopago');
      } else {
        toast({
          title: data.error || "Pagamento não aprovado",
          description: data.action || "Tente novamente com outro método de pagamento.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao processar pagamento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const processarAssinaturaRecorrenteMutation = useMutation({
    mutationFn: async (cardData: any) => {
      const res = await apiRequest("POST", "/api/checkout/mercadopago/assinatura", {
        pagamentoId,
        cardToken: cardData.token,
        payerEmail: formData.email,
        paymentMethodId: cardData.payment_method_id,
        issuerId: cardData.issuer_id,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.status === 'authorized') {
        // Only track purchase and redirect to success when ACTUALLY authorized
        if (selectedPlano) {
          trackPurchase({
            value: selectedPlano.preco,
            currency: "BRL",
            content_name: selectedPlano.nome,
          });
        }
        setLocation('/pagamento/sucesso?gateway=mercadopago&tipo=assinatura');
      } else if (data.status === 'pending') {
        // Pending means still processing - do NOT grant access yet
        setLocation('/pagamento/pendente?gateway=mercadopago&tipo=assinatura');
      } else {
        toast({
          title: data.error || "Assinatura não autorizada",
          description: data.action || "Tente novamente com outro cartão.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao processar assinatura",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleMpSubmit = useCallback(async (formData: any) => {
    setIsProcessingPayment(true);
    try {
      await processarPagamentoMpMutation.mutateAsync(formData);
    } finally {
      setIsProcessingPayment(false);
    }
  }, [processarPagamentoMpMutation]);

  const handleCardPaymentSubmit = useCallback(async (cardData: any) => {
    setIsProcessingPayment(true);
    try {
      await processarAssinaturaRecorrenteMutation.mutateAsync(cardData);
    } finally {
      setIsProcessingPayment(false);
    }
  }, [processarAssinaturaRecorrenteMutation]);

  const handleMpReady = useCallback(() => {
    console.log('[MercadoPago] Payment Brick ready');
  }, []);

  const handleMpError = useCallback((error: any) => {
    console.error('[MercadoPago] Payment Brick error:', error);
    toast({
      title: "Erro no pagamento",
      description: error?.message || "Ocorreu um erro. Tente novamente.",
      variant: "destructive",
    });
  }, [toast]);

  // Memoize CardPayment initialization to prevent re-renders
  const cardPaymentInitialization = useMemo(() => {
    if (!selectedPlano || !formData.email) return null;
    const docDigits = formData.documento.replace(/\D/g, '');
    const hasValidDoc = (formData.tipoDocumento === "CPF" && docDigits.length >= 11) || 
                        (formData.tipoDocumento === "CNPJ" && docDigits.length >= 14);
    return {
      amount: selectedPlano.preco / 100,
      payer: {
        email: formData.email,
        ...(hasValidDoc ? {
          identification: {
            type: formData.tipoDocumento,
            number: docDigits,
          },
        } : {}),
      },
    };
  }, [selectedPlano?.preco, formData.email, formData.documento, formData.tipoDocumento]);

  // Memoize CardPayment customization
  const cardPaymentCustomization = useMemo(() => ({
    visual: {
      style: {
        theme: 'default' as const,
      },
      texts: {
        formTitle: 'Dados do Cartão',
        formSubmit: 'Assinar Agora',
      },
    },
    paymentMethods: {
      maxInstallments: 1,
    },
  }), []);

  // Memoize Payment initialization
  const paymentInitialization = useMemo(() => {
    if (!selectedPlano) return null;
    return {
      amount: selectedPlano.preco / 100,
      preferenceId: undefined,
    };
  }, [selectedPlano?.preco]);

  // Memoize Payment customization
  const paymentCustomization = useMemo(() => ({
    paymentMethods: {
      creditCard: 'all' as const,
      debitCard: 'all' as const,
      ticket: 'all' as const,
      bankTransfer: 'all' as const,
    },
    visual: {
      style: {
        theme: 'default' as const,
      },
    },
  }), []);

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.email || !formData.telefone) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: "Nome, email e telefone são necessários.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate phone has at least 10 digits
    const phoneDigits = formData.telefone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      toast({
        title: "Telefone inválido",
        description: "Informe um telefone válido com DDD.",
        variant: "destructive",
      });
      return;
    }
    
    iniciarMutation.mutate();
  };

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

  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 11);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return numbers.replace(/(\d{3})(\d+)/, '$1.$2');
    if (numbers.length <= 9) return numbers.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
  };

  const formatCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 14);
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 5) return numbers.replace(/(\d{2})(\d+)/, '$1.$2');
    if (numbers.length <= 8) return numbers.replace(/(\d{2})(\d{3})(\d+)/, '$1.$2.$3');
    if (numbers.length <= 12) return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d+)/, '$1.$2.$3/$4');
    return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d+)/, '$1.$2.$3/$4-$5');
  };

  const formatDocumento = (value: string) => {
    return formData.tipoDocumento === "CPF" ? formatCPF(value) : formatCNPJ(value);
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return value;
  };

  if (loadingPlanos || (planoId && loadingDirectPlano)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!planoId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="container mx-auto max-w-6xl px-4 py-12">
          <div className="text-center mb-16">
            <div className="flex justify-center mb-8">
              <img 
                src={logoImage} 
                alt="AutoWebinar" 
                className="h-16 md:h-20"
                data-testid="img-logo"
              />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-6 text-white" data-testid="text-checkout-title">
              Transforme suas Vendas com
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                Webinários Automatizados
              </span>
            </h1>
            <p className="text-slate-300 text-lg md:text-xl max-w-2xl mx-auto">
              Venda no piloto automático 24/7. Crie webinários que parecem ao vivo, 
              com chat simulado, ofertas cronometradas e tudo que você precisa para converter.
            </p>
          </div>

          <div className="grid gap-4 md:gap-6 mb-12">
            <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Setup em minutos</span>
              </div>
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-cyan-400" />
                <span>Parece 100% ao vivo</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                <span>Sem mensalidade oculta</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Suporte em português</span>
              </div>
            </div>
          </div>

          {planos?.length === 0 ? (
            <Card className="max-w-md mx-auto bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <Sparkles className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
                <p className="text-slate-300">
                  Estamos preparando nossos planos. Volte em breve!
                </p>
              </CardContent>
            </Card>
          ) : isRenovacao && !planos?.some((p) => p.disponivelRenovacao) ? (
            <Card className="max-w-md mx-auto bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <RefreshCw className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
                <p className="text-slate-300 mb-4">
                  No momento não há planos disponíveis para renovação.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setLocation("/checkout")}
                  className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                >
                  Ver todos os planos
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {isRenovacao && (
                <div className="mb-6 p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-center">
                  <RefreshCw className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
                  <p className="text-cyan-300 text-sm">
                    Você está renovando sua assinatura. Veja os planos disponíveis para renovação.
                  </p>
                </div>
              )}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
                {planos?.map((plano) => {
                  const beneficios = getBeneficios(plano.beneficios);
                  return (
                    <Card
                      key={plano.id}
                      className={`relative bg-slate-800/50 border-slate-700 hover:border-cyan-500/50 transition-all duration-300 ${
                        plano.destaque ? "border-cyan-500 shadow-lg shadow-cyan-500/20 scale-[1.02]" : ""
                      }`}
                      data-testid={`card-plano-${plano.id}`}
                    >
                      {plano.destaque && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <Badge className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0 flex items-center gap-1 px-4">
                            <Star className="w-3 h-3" />
                            Mais Escolhido
                          </Badge>
                        </div>
                      )}
                      <CardHeader className="text-center pb-2">
                        <CardTitle className="text-xl text-white">{plano.nome}</CardTitle>
                        <CardDescription className="text-slate-400">{plano.descricao}</CardDescription>
                        <div className="mt-6">
                          <span className="text-5xl font-bold text-white">
                            {formatCurrency(plano.preco)}
                          </span>
                          <p className="text-slate-400 text-sm mt-1">
                            Acesso por {plano.prazoDias} dias
                          </p>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-3 pt-4 border-t border-slate-700">
                          <div className="flex items-center gap-3 text-sm">
                            <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                              <Check className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-slate-300">
                              {plano.webinarLimit >= 999 ? 'Webinários ilimitados' : `${plano.webinarLimit} webinários`}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                              <Check className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-slate-300">
                              {plano.storageLimit || 5}GB de armazenamento
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                              <Check className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-slate-300">Visualizações ilimitadas</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                              <Check className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-slate-300">Leads capturados ilimitados</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <div className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center">
                              <Globe className="w-3 h-3 text-cyan-400" />
                            </div>
                            <span className="text-slate-300">Domínio customizado incluso</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                              <Mail className="w-3 h-3 text-blue-400" />
                            </div>
                            <span className="text-slate-300">Sequência de Emails</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                              <SiWhatsapp className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-slate-300">WhatsApp Marketing</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                              <SiWhatsapp className="w-3 h-3 text-green-400" />
                            </div>
                            <span className="text-slate-300">
                              {(plano.whatsappAccountLimit ?? 2) >= 999 ? 'Conexões WhatsApp ilimitadas' : `${plano.whatsappAccountLimit ?? 2} conexões WhatsApp`}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center">
                              <Bell className="w-3 h-3 text-orange-400" />
                            </div>
                            <span className="text-slate-300">Lembretes automáticos</span>
                          </div>
                          {plano.webinarLimit > 5 ? (
                            <div className="flex items-center gap-3 text-sm">
                              <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                                <Play className="w-3 h-3 text-purple-400" />
                              </div>
                              <span className="text-slate-300">Replay automático</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 text-sm">
                              <div className="w-5 h-5 rounded-full bg-slate-600/20 flex items-center justify-center">
                                <X className="w-3 h-3 text-slate-500" />
                              </div>
                              <span className="text-slate-500 line-through">Replay automático</span>
                              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">Pro+</Badge>
                            </div>
                          )}
                          {plano.webinarLimit > 5 ? (
                            <div className="flex items-center gap-3 text-sm">
                              <div className="w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center">
                                <Sparkles className="w-3 h-3 text-violet-400" />
                              </div>
                              <span className="text-slate-300">Gerador de Roteiro IA</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 text-sm">
                              <div className="w-5 h-5 rounded-full bg-slate-600/20 flex items-center justify-center">
                                <X className="w-3 h-3 text-slate-500" />
                              </div>
                              <span className="text-slate-500 line-through">Gerador de Roteiro IA</span>
                              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">Pro+</Badge>
                            </div>
                          )}
                          {plano.webinarLimit > 5 ? (
                            <div className="flex items-center gap-3 text-sm">
                              <div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center">
                                <Mic className="w-3 h-3 text-rose-400" />
                              </div>
                              <span className="text-slate-300">Transcrição Automática</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 text-sm">
                              <div className="w-5 h-5 rounded-full bg-slate-600/20 flex items-center justify-center">
                                <X className="w-3 h-3 text-slate-500" />
                              </div>
                              <span className="text-slate-500 line-through">Transcrição Automática</span>
                              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">Pro+</Badge>
                            </div>
                          )}
                          {beneficios
                            .filter((b: string) => 
                              !b.toLowerCase().includes('suporte por email') &&
                              !b.toLowerCase().includes('suporte prioritário') &&
                              !b.toLowerCase().includes('api de integração') &&
                              !b.toLowerCase().includes('gerente de conta') &&
                              !b.toLowerCase().includes('domínio')
                            )
                            .map((beneficio: string, index: number) => (
                            <div key={index} className="flex items-center gap-3 text-sm">
                              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                                <Check className="w-3 h-3 text-green-400" />
                              </div>
                              <span className="text-slate-300">{beneficio}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-2">
                          <Lock className="w-3 h-3" />
                          <span>Pagamento seguro</span>
                          {plano.gateway === "mercadopago" ? (
                            <SiMercadopago className="w-4 h-4 ml-1" />
                          ) : (
                            <SiStripe className="w-4 h-4 ml-1" />
                          )}
                        </div>
                      </CardContent>
                      <CardFooter>
                        {(() => {
                          const buttonInfo = getButtonInfo(plano);
                          const isRenew = buttonInfo.type === "renew";
                          const isUpgrade = buttonInfo.type === "upgrade";
                          
                          return (
                            <Button
                              className={`w-full ${
                                isUpgrade
                                  ? "bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white"
                                  : isRenew
                                    ? "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
                                    : plano.destaque 
                                      ? "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white" 
                                      : ""
                              }`}
                              size="lg"
                              variant={plano.destaque || isRenew || isUpgrade ? "default" : "outline"}
                              onClick={() => {
                                const params = new URLSearchParams();
                                if (isRenew && currentUser) {
                                  params.set("renovacao", "true");
                                  params.set("email", currentUser.email);
                                  params.set("nome", currentUser.name);
                                }
                                const queryString = params.toString();
                                setLocation(`/checkout/${plano.id}${queryString ? `?${queryString}` : ""}`);
                              }}
                              data-testid={`button-select-${plano.id}`}
                            >
                              {isRenew && <RefreshCw className="w-4 h-4 mr-2" />}
                              {isUpgrade && <Zap className="w-4 h-4 mr-2" />}
                              {buttonInfo.text}
                              {!isRenew && !isUpgrade && <ArrowRight className="w-4 h-4 ml-2" />}
                            </Button>
                          );
                        })()}
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>

              <div className="text-center">
                <p className="text-slate-500 text-sm">
                  Dúvidas? Entre em contato: suporte@autowebinar.com.br
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!selectedPlano) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Card className="max-w-md bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <p className="text-slate-300">Plano não encontrado</p>
            <Button className="mt-4" onClick={() => setLocation("/checkout")}>
              Ver todos os planos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const beneficios = getBeneficios(selectedPlano.beneficios);
  const isProcessing = iniciarMutation.isPending || processarPagamentoMpMutation.isPending || isProcessingPayment;
  const isMercadoPago = selectedPlano.gateway === "mercadopago";
  const isRecorrente = selectedPlano.tipoCobranca === "recorrente";

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="flex justify-center mb-8">
          <img 
            src={logoImage} 
            alt="AutoWebinar" 
            className="h-12"
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-white border-0 shadow-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-slate-900 text-xl">Seus Dados</CardTitle>
                <CardDescription className="text-slate-500">
                  Preencha seus dados para continuar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitForm} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome" className="text-slate-700">Nome Completo *</Label>
                    <Input
                      id="nome"
                      data-testid="input-checkout-nome"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Seu nome completo"
                      className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-12"
                      disabled={step === "payment"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-700">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      data-testid="input-checkout-email"
                      value={formData.email}
                      onChange={(e) => !isRenovacao && setFormData({ ...formData, email: e.target.value })}
                      placeholder="seu@email.com"
                      className={`bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-12 ${isRenovacao ? "bg-slate-100 cursor-not-allowed" : ""}`}
                      disabled={step === "payment" || isRenovacao}
                      readOnly={isRenovacao}
                    />
                    {isRenovacao && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Email vinculado à sua conta - não pode ser alterado na renovação
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700">Tipo de Documento *</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="tipoDocumento"
                          value="CPF"
                          checked={formData.tipoDocumento === "CPF"}
                          onChange={(e) => setFormData({ ...formData, tipoDocumento: e.target.value as "CPF" | "CNPJ", documento: "" })}
                          className="w-4 h-4 text-cyan-500"
                          disabled={step === "payment"}
                          data-testid="radio-tipo-cpf"
                        />
                        <span className="text-slate-700">CPF (Pessoa Física)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="tipoDocumento"
                          value="CNPJ"
                          checked={formData.tipoDocumento === "CNPJ"}
                          onChange={(e) => setFormData({ ...formData, tipoDocumento: e.target.value as "CPF" | "CNPJ", documento: "" })}
                          className="w-4 h-4 text-cyan-500"
                          disabled={step === "payment"}
                          data-testid="radio-tipo-cnpj"
                        />
                        <span className="text-slate-700">CNPJ (Empresa)</span>
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="documento" className="text-slate-700">{formData.tipoDocumento} *</Label>
                      <Input
                        id="documento"
                        data-testid="input-checkout-documento"
                        value={formData.documento}
                        onChange={(e) => setFormData({ ...formData, documento: formatDocumento(e.target.value) })}
                        placeholder={formData.tipoDocumento === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
                        className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-12"
                        maxLength={formData.tipoDocumento === "CPF" ? 14 : 18}
                        disabled={step === "payment"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefone" className="text-slate-700">Telefone *</Label>
                      <Input
                        id="telefone"
                        data-testid="input-checkout-telefone"
                        value={formData.telefone}
                        onChange={(e) => setFormData({ ...formData, telefone: formatPhone(e.target.value) })}
                        placeholder="(00) 00000-0000"
                        className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-12"
                        maxLength={15}
                        required
                        disabled={step === "payment"}
                      />
                    </div>
                  </div>

                  {step === "form" && (
                    <>
                      <div className="flex items-center justify-center gap-6 pt-4 border-t border-slate-100">
                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                          <Lock className="w-4 h-4" />
                          <span>Dados Protegidos</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                          <ShieldCheck className="w-4 h-4" />
                          <span>100% Seguro</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                          <Bolt className="w-4 h-4" />
                          <span>Acesso Imediato</span>
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-[#00b4e6] hover:bg-[#0099cc] text-white h-14 text-lg font-semibold"
                        disabled={isProcessing}
                        data-testid="button-continue-checkout"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Processando...
                          </>
                        ) : (
                          <>
                            Continuar para Pagamento
                            <ArrowRight className="w-5 h-5 ml-2" />
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </form>
              </CardContent>
            </Card>

            {step === "payment" && (
              <Card className="bg-white border-0 shadow-xl">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-slate-900 text-xl flex items-center gap-2">
                        {isRecorrente && <RefreshCw className="w-5 h-5 text-blue-500" />}
                        {isRecorrente ? "Assinar Plano Recorrente" : "Escolha a forma de pagamento"}
                      </CardTitle>
                      <CardDescription className="text-slate-500">
                        {isRecorrente 
                          ? "Este é um plano de assinatura com cobrança recorrente" 
                          : "Selecione como deseja pagar"
                        }
                      </CardDescription>
                    </div>
                    {isMercadoPago ? (
                      <SiMercadopago className="w-8 h-8 text-[#00b1ea]" />
                    ) : (
                      <SiStripe className="w-8 h-8 text-[#635bff]" />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {isRecorrente && (
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex items-start gap-3">
                        <RefreshCw className="w-5 h-5 text-blue-500 mt-0.5" />
                        <div>
                          <p className="font-medium text-blue-900">Renovação Automática</p>
                          <p className="text-sm text-blue-700">
                            Sua assinatura será renovada automaticamente a cada 1 mês.
                            <br />
                            Você pode cancelar a qualquer momento através da sua área de membros.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {isMercadoPago && pagamentoId ? (
                    isRecurring ? (
                      mpInitialized && cardPaymentInitialization ? (
                        <div className="mercadopago-container" key="card-payment-container">
                          <CardPayment
                            initialization={cardPaymentInitialization}
                            customization={cardPaymentCustomization}
                            onSubmit={handleCardPaymentSubmit}
                            onReady={handleMpReady}
                            onError={handleMpError}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                        </div>
                      )
                    ) : mpInitialized && paymentInitialization ? (
                      <div className="mercadopago-container" key="payment-container">
                        <Payment
                          initialization={paymentInitialization}
                          customization={paymentCustomization}
                          onSubmit={handleMpSubmit}
                          onReady={handleMpReady}
                          onError={handleMpError}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                      </div>
                    )
                  ) : !isMercadoPago && stripePromise && stripeClientSecret ? (
                    <Elements 
                      stripe={stripePromise} 
                      options={{ 
                        clientSecret: stripeClientSecret,
                        appearance: {
                          theme: 'stripe',
                          variables: {
                            colorPrimary: '#635bff',
                            colorBackground: '#ffffff',
                            colorText: '#1e293b',
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                            borderRadius: '8px',
                          },
                        },
                      }}
                    >
                      <StripeCheckoutForm 
                        onSuccess={() => setLocation('/pagamento/sucesso?gateway=stripe')}
                        onError={(error) => toast({ title: "Erro", description: error, variant: "destructive" })}
                        isProcessing={isProcessingPayment}
                        setIsProcessing={setIsProcessingPayment}
                      />
                    </Elements>
                  ) : (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="bg-[#0a3d62] border-0 shadow-xl text-white sticky top-8">
              <CardHeader className="pb-4 border-b border-white/10">
                <Badge className="w-fit bg-emerald-500/20 text-emerald-300 border-emerald-500/30 mb-2">
                  Resumo do Pedido
                </Badge>
                <CardTitle className="text-2xl">{selectedPlano.nome}</CardTitle>
                <CardDescription className="text-slate-300">
                  {selectedPlano.descricao || `acesso ${selectedPlano.prazoDias} dias`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Duração do acesso</span>
                  <Badge className="bg-emerald-500 text-white border-0">
                    {selectedPlano.prazoDias} dias
                  </Badge>
                </div>

                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-slate-300 text-sm mb-1">Total:</p>
                  <span className="text-4xl font-bold text-emerald-400">
                    {formatCurrency(selectedPlano.preco)}
                  </span>
                  {isRecorrente && (
                    <p className="text-slate-300 text-sm mt-1">
                      Você será cobrado mensalmente
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-300">Formas de Pagamento Aceitas:</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                      <CreditCard className="w-5 h-5 text-emerald-400" />
                      <span>Cartão de Crédito</span>
                      <div className="ml-auto flex gap-1">
                        <SiVisa className="w-6 h-6" />
                        <SiMastercard className="w-6 h-6" />
                      </div>
                    </div>
                    {isMercadoPago && !isRecorrente && (
                      <>
                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                          <QrCode className="w-5 h-5 text-yellow-400" />
                          <span>Pix (Aprovação Instantânea)</span>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                          <Barcode className="w-5 h-5 text-orange-400" />
                          <span>Boleto Bancário</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-medium">Compra 100% Segura</p>
                      <p className="text-xs text-slate-400">Seus dados estão protegidos</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Bolt className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-medium">Acesso Imediato</p>
                      <p className="text-xs text-slate-400">Aproveite agora mesmo</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-medium">Recursos do Plano</p>
                      <p className="text-xs text-slate-400">Conforme benefícios do {selectedPlano.nome}</p>
                    </div>
                  </div>
                </div>

                <div className="text-center pt-4 border-t border-white/10">
                  <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                    <Lock className="w-4 h-4" />
                    <span>Processamento seguro via</span>
                    {isMercadoPago ? (
                      <SiMercadopago className="w-5 h-5 text-[#00b1ea]" />
                    ) : (
                      <SiStripe className="w-5 h-5 text-[#635bff]" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
