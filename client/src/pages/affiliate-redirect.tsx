import { useEffect } from "react";
import { useParams } from "wouter";

export default function AffiliateRedirectPage() {
  const params = useParams<{ code: string }>();

  useEffect(() => {
    if (params.code) {
      window.location.href = `/api/affiliate-links/${params.code}/track`;
    }
  }, [params.code]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Redirecionando...</p>
      </div>
    </div>
  );
}
