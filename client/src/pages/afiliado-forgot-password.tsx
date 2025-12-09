import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Mail, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { Link } from "wouter";

const forgotPasswordSchema = z.object({
  email: z.string().email("E-mail inválido"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function AfiliadoForgotPasswordPage() {
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordFormData) => {
      const response = await apiRequest("POST", "/api/affiliates/forgot-password", data);
      return response.json();
    },
    onSuccess: () => {
      setEmailSent(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao processar solicitação.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ForgotPasswordFormData) => {
    forgotPasswordMutation.mutate(data);
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle>E-mail Enviado</CardTitle>
              <CardDescription>
                Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground mb-6">
                Verifique sua caixa de entrada e a pasta de spam.
              </p>
              <Link href="/afiliado/login">
                <Button variant="outline" className="w-full" data-testid="button-back-to-login">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar ao Login
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
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Recuperar Senha</CardTitle>
            <CardDescription>
              Digite seu e-mail para receber as instruções de recuperação de senha
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input 
                          type="email" 
                          placeholder="seu@email.com" 
                          data-testid="input-email"
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
                  disabled={forgotPasswordMutation.isPending}
                  data-testid="button-submit"
                >
                  {forgotPasswordMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Enviar Instruções
                    </>
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center">
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
