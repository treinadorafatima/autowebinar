import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Send, Trash2, Check, X } from "lucide-react";

interface PendingComment {
  id: string;
  author: string;
  text: string;
  timestamp: number;
  sessionDate: string;
  createdAt: string;
}

interface ApprovedComment {
  id: string;
  author: string;
  text: string;
  timestamp: number;
  isModeratorMessage: boolean;
  moderatorName?: string;
  createdAt: string;
}

export default function WebinarModeratorPage() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [moderatorName, setModeratorName] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [approvedComments, setApprovedComments] = useState<ApprovedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedModeratorName = localStorage.getItem(`moderator-${slug}-name`);
    const savedToken = localStorage.getItem(`moderator-${slug}-token`);
    
    if (savedModeratorName && savedToken) {
      setModeratorName(savedModeratorName);
      setToken(savedToken);
      setIsAuthenticated(true);
      loadComments(savedToken);
    } else {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => loadComments(token), 3000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [approvedComments]);

  async function loadComments(authToken: string) {
    try {
      const res = await fetch(`/api/webinars/${slug}/moderator/comments`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingComments(data.pending || []);
        setApprovedComments(data.approved || []);
      } else if (res.status === 401) {
        setIsAuthenticated(false);
        localStorage.removeItem(`moderator-${slug}-name`);
        localStorage.removeItem(`moderator-${slug}-token`);
        toast({ title: "Sessão expirada", variant: "destructive" });
      }
    } catch (error) {
      console.error("Erro ao carregar comentários:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthenticate(e: React.FormEvent) {
    e.preventDefault();
    if (!moderatorName.trim()) {
      toast({ title: "Digite seu nome", variant: "destructive" });
      return;
    }

    try {
      const res = await fetch(`/api/webinars/${slug}/moderator/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moderatorName }),
      });

      if (!res.ok) {
        toast({ title: "Erro ao acessar moderação", variant: "destructive" });
        return;
      }

      const data = await res.json();
      localStorage.setItem(`moderator-${slug}-name`, moderatorName);
      localStorage.setItem(`moderator-${slug}-token`, data.token);
      setToken(data.token);
      setIsAuthenticated(true);
      await loadComments(data.token);
    } catch (error) {
      toast({ title: "Erro ao conectar", variant: "destructive" });
    }
  }

  async function handleApprove(commentId: string) {
    try {
      const res = await fetch(`/api/webinars/${slug}/moderator/comments/${commentId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadComments(token);
        toast({ title: "Comentário aprovado!" });
      }
    } catch (error) {
      toast({ title: "Erro ao aprovar", variant: "destructive" });
    }
  }

  async function handleReject(commentId: string) {
    try {
      const res = await fetch(`/api/webinars/${slug}/moderator/comments/${commentId}/reject`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadComments(token);
        toast({ title: "Comentário recusado" });
      }
    } catch (error) {
      toast({ title: "Erro ao recusar", variant: "destructive" });
    }
  }

  async function handleSendMessage() {
    if (!newMessage.trim()) return;

    try {
      const res = await fetch(`/api/webinars/${slug}/moderator/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: newMessage }),
      });

      if (res.ok) {
        setNewMessage("");
        await loadComments(token);
        toast({ title: "Mensagem enviada!" });
      }
    } catch (error) {
      toast({ title: "Erro ao enviar mensagem", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Painel de Moderação
            </CardTitle>
            <CardDescription>Entre com seu nome para moderar o chat</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuthenticate} className="space-y-4">
              <Input
                placeholder="Seu nome"
                value={moderatorName}
                onChange={(e) => setModeratorName(e.target.value)}
                data-testid="input-moderator-name"
              />
              <Button type="submit" className="w-full" data-testid="button-auth-moderator">
                Acessar Moderação
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Moderação do Chat</h1>
          <Button
            variant="outline"
            onClick={() => {
              setIsAuthenticated(false);
              setModeratorName("");
              setToken("");
              localStorage.removeItem(`moderator-${slug}-name`);
              localStorage.removeItem(`moderator-${slug}-token`);
            }}
            data-testid="button-logout-moderator"
          >
            Sair
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pending Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pendentes ({pendingComments.length})</CardTitle>
              <CardDescription>Mensagens aguardando aprovação</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
              {pendingComments.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma mensagem pendente</p>
              ) : (
                pendingComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="p-3 border rounded-lg bg-muted/50 space-y-2"
                    data-testid={`pending-comment-${comment.id}`}
                  >
                    <p className="font-medium text-sm">{comment.author}</p>
                    <p className="text-sm">{comment.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(comment.createdAt).toLocaleTimeString("pt-BR")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(comment.id)}
                        data-testid={`button-approve-${comment.id}`}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(comment.id)}
                        data-testid={`button-reject-${comment.id}`}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Recusar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Chat */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">Chat ao Vivo</CardTitle>
              <CardDescription>Mensagens aprovadas e moderador</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col space-y-3">
              <div className="flex-1 overflow-y-auto space-y-2 max-h-72">
                {approvedComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="p-2 bg-muted/30 rounded text-sm"
                    data-testid={`approved-comment-${comment.id}`}
                  >
                    <p className="font-medium text-xs">
                      {comment.isModeratorMessage ? `${comment.moderatorName} (Moderador)` : comment.author}
                    </p>
                    <p className="text-xs text-foreground">{comment.text}</p>
                  </div>
                ))}
                <div ref={commentsEndRef} />
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  data-testid="input-moderator-message"
                />
                <Button
                  size="sm"
                  onClick={handleSendMessage}
                  data-testid="button-send-moderator-message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
