import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startEmailScheduler } from "./email-scheduler";
import { startWhatsappScheduler } from "./whatsapp-scheduler";
import { startSubscriptionScheduler } from "./subscription-scheduler";
import { startAffiliatePayoutScheduler } from "./affiliate-payout-scheduler";
import { startPixExpirationScheduler } from "./pix-expiration-scheduler";
import { startEmailRetryScheduler } from "./email";
import { startPendingMessagesRetry } from "./whatsapp-notifications";
import { startAiMemoryCleanupScheduler } from "./ai-memory-cleanup-scheduler";

const app = express();

// Cookie parser middleware
app.use(cookieParser());

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// Compression middleware - skips video streams
app.use((req, res, next) => {
  if (req.path.includes("/api/webinar/video/")) {
    return next();
  }
  compression()(req, res, next);
});

app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));

// Security headers for iframe embedding
// Páginas públicas de webinar podem ser embedadas com ?embed=1
// Rotas de embed de vídeo sempre permitem embedding
// Admin e outras rotas ficam protegidas contra clickjacking
app.use((req, res, next) => {
  const isEmbedMode = req.query.embed === "1";
  const isPublicWebinar = req.path.startsWith("/w/");
  const isPublicPage = req.path.startsWith("/carlos") || 
                       req.path.startsWith("/aula-") ||
                       req.path === "/" ||
                       !req.path.startsWith("/admin") && !req.path.startsWith("/api") && !req.path.startsWith("/login");
  const isApiForEmbed = req.path.includes("/embed-code") || 
                        (req.path.includes("/api/webinars/") && req.path.includes("/comments"));
  
  // Rotas de embed de vídeo sempre permitem embedding em qualquer domínio
  const isVideoEmbed = req.path.startsWith("/embed/video/") || 
                       req.path.startsWith("/api/embed/video/") ||
                       req.path.startsWith("/api/webinar/video/") ||
                       req.path.startsWith("/api/webinar/hls/");
  
  if (isVideoEmbed || isEmbedMode && (isPublicWebinar || isPublicPage) || isApiForEmbed) {
    // Permitir embedding em qualquer domínio para páginas públicas com embed=1 e embeds de vídeo
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
  } else {
    // Bloquear iframe para admin e outras páginas (proteção contra clickjacking)
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // Increase timeout for large file uploads (15 minutes)
  server.timeout = 15 * 60 * 1000;
  server.headersTimeout = 16 * 60 * 1000;
  server.keepAliveTimeout = 15 * 60 * 1000;
  
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start email scheduler for automated email sending
    startEmailScheduler();
    
    // Start WhatsApp scheduler for automated message sending
    startWhatsappScheduler();
    
    // Start subscription scheduler for expiration reminders
    startSubscriptionScheduler();
    
    // Start affiliate payout scheduler for delayed commission payments
    startAffiliatePayoutScheduler();
    
    // Start PIX expiration scheduler for recovery emails
    startPixExpirationScheduler();
    
    // Start email retry scheduler for failed webhook emails
    startEmailRetryScheduler();
    
    // Start WhatsApp pending messages retry scheduler
    startPendingMessagesRetry();
    
    // Start AI memory cleanup scheduler (runs every 6 hours)
    startAiMemoryCleanupScheduler();
  });
})();
