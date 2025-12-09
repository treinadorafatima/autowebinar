import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Lock, Loader2, CheckCircle, XCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const resetPasswordSchema = z.object({
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string().min(6, "Confirme sua senha"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function AfiliadoResetPasswordPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [success, setSuccess] = useState(false);

  const params = new URLSearchParams(search);
  const token = params.get("token") || "";

  const { data: tokenData, isLoading: verifyingToken } = useQuery({
    queryKey: ["/api/affiliates/verify-reset-token", token],
    queryFn: async () => {
      if (!token) return { valid: false, error: "Token não fornecido" };
      const response = await fetch(`/api/affiliates/verify-reset-token/${token}`);
      return response.json();
    },
    enabled: !!token,
  });

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordFormData) => {
      const response = await apiRequest("POST", "/api/affiliates/reset-password", {
        token,
        password: data.password,
      });
      return response.json();
    },
    onSuccess: () => {
      setSuccess(true);
      toast({
        title: "Senha redefinida",
        description: "Sua senha foi alterada com sucesso!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao redefinir senha.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ResetPasswordFormData) => {
    resetPasswordMutation.mutate(data);
  };

  if (verifyingToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!token || (tokenData && !tokenData.valid)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle>Link Inválido</CardTitle>
              <CardDescription>
                {tokenData?.error || "Este link de recuperação de senha é inválido ou expirou."}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/afiliado/forgot-password">
                <Button className="w-full" data-testid="button-request-new">
                  Solicitar Novo Link
                </Button>
              </Link>
              <div className="mt-4">
                <Link href="/afiliado/login">
                  <Button variant="ghost" size="sm" data-testid="link-back-to-login">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar ao Login
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle>Senha Redefinida</CardTitle>
              <CardDescription>
                Sua senha foi alterada com sucesso! Agora você pode acessar sua conta.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/afiliado/login">
                <Button className="w-full" data-testid="button-go-to-login">
                  Ir para o Login
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Nova Senha</CardTitle>
            <CardDescription>
              Digite sua nova senha para a conta: {tokenData?.email}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nova Senha</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="Mínimo 6 caracteres" 
                          data-testid="input-password"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar Senha</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="Digite a senha novamente" 
                          data-testid="input-confirm-password"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={resetPasswordMutation.isPending}
                  data-testid="button-submit"
                >
                  {resetPasswordMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Redefinir Senha
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
