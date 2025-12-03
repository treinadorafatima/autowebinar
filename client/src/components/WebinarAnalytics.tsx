import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingDown, Clock, Users } from "lucide-react";

interface Analytics {
  totalSessions: number;
  avgDurationSeconds: number;
  retentionByMinute: Record<number, number>;
}

interface WebinarAnalyticsProps {
  webinarId: string;
  videoDuration: number;
  token: string;
}

export default function WebinarAnalytics({ webinarId, videoDuration, token }: WebinarAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [error, setError] = useState<string>("");

  const today = new Date();
  const dateString = today.toISOString().split("T")[0];

  useEffect(() => {
    setSelectedDate(dateString);
  }, [dateString]);

  useEffect(() => {
    if (selectedDate) {
      fetchAnalytics(selectedDate);
    }
  }, [selectedDate, webinarId, token]);

  async function fetchAnalytics(date: string) {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/webinars/${webinarId}/analytics?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      } else if (res.status === 401) {
        setError("Não autorizado. Faça login novamente.");
      } else {
        setError("Erro ao carregar estatísticas");
      }
    } catch (error) {
      console.error("Erro ao carregar analytics:", error);
      setError("Erro de conexão ao carregar estatísticas");
    } finally {
      setLoading(false);
    }
  }

  const videoDurationMinutes = Math.floor(videoDuration / 60);
  
  // Gerar dados do gráfico até o final do vídeo
  const chartData = analytics
    ? (() => {
        const data = [];
        for (let min = 0; min <= videoDurationMinutes; min++) {
          const count = analytics.retentionByMinute[min] || 0;
          data.push({
            minute: min,
            usuarios: count,
            percentualRetencao: ((count / (analytics.totalSessions || 1)) * 100).toFixed(1),
          });
        }
        return data;
      })()
    : [];

  const avgDurationMinutes = analytics ? Math.floor(analytics.avgDurationSeconds / 60) : 0;
  
  // Calcular taxa de fuga baseado no ponto de retenção máximo encontrado
  const dropoffRate = analytics && Object.keys(analytics.retentionByMinute).length > 0
    ? (() => {
        const maxMinute = Math.max(...Object.keys(analytics.retentionByMinute).map(Number));
        const retentionAtMax = analytics.retentionByMinute[maxMinute] || 0;
        return (((analytics.totalSessions - retentionAtMax) / (analytics.totalSessions || 1)) * 100).toFixed(1);
      })()
    : "0";

  if (error) {
    return (
      <div className="p-6 rounded-lg bg-destructive/10 border border-destructive/30">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtro de Data */}
      <Card>
        <CardHeader>
          <CardTitle>Filtro de Data</CardTitle>
          <CardDescription>Selecione uma data para visualizar as estatísticas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Data da Sessão</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={dateString}
            />
          </div>
        </CardContent>
      </Card>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Total de Sessões
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{analytics?.totalSessions || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-500" />
              Tempo Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{avgDurationMinutes}m {analytics ? Math.floor(analytics.avgDurationSeconds % 60) : 0}s</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-orange-500" />
              Taxa de Fuga
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{dropoffRate}%</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-500" />
              Duração Vídeo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{videoDurationMinutes}m</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Retenção */}
      <Card>
        <CardHeader>
          <CardTitle>Gráfico de Retenção</CardTitle>
          <CardDescription>Número de usuários em cada minuto do vídeo</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-80" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="minute" label={{ value: "Minuto do Vídeo", position: "insideBottom", offset: -5 }} />
                <YAxis label={{ value: "Usuários Retidos", angle: -90, position: "insideLeft" }} />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (name === "usuarios") return [value, "Usuários"];
                    return [value + "%", "% de Retenção"];
                  }}
                />
                <Bar dataKey="usuarios" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-muted-foreground">
              Nenhum dado de retenção disponível para esta data
            </div>
          )}
        </CardContent>
      </Card>

      {/* Análise de Fuga */}
      <Card>
        <CardHeader>
          <CardTitle>Pontos de Fuga</CardTitle>
          <CardDescription>Minutos onde o maior número de usuários abandonou</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32" />
          ) : chartData.length > 1 ? (
            <div className="space-y-2">
              {chartData
                .slice()
                .sort((a, b) => {
                  const dropoffA = (a.usuarios - (chartData[chartData.indexOf(a) + 1]?.usuarios || 0)) / (analytics?.totalSessions || 1);
                  const dropoffB = (b.usuarios - (chartData[chartData.indexOf(b) + 1]?.usuarios || 0)) / (analytics?.totalSessions || 1);
                  return dropoffB - dropoffA;
                })
                .slice(0, 5)
                .map((point, idx) => {
                  const nextPoint = chartData[chartData.indexOf(point) + 1];
                  const dropoff = nextPoint ? point.usuarios - nextPoint.usuarios : 0;
                  return (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted">
                      <span className="font-medium">{point.minute}m</span>
                      <span className="text-sm text-muted-foreground">
                        {dropoff} usuários saíram ({((dropoff / (analytics?.totalSessions || 1)) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-muted-foreground">Sem dados suficientes para análise</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
