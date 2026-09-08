import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { migrateDatabase } from "../db";
import { seedIfEmpty } from "../seed";
import { markOnlinePaymentSucceeded, verifyMonerooSignature } from "../routers/shop";
import { extractSucceededPaymentId } from "../domain/payments";
import { getDb } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Migrations appliquées au démarrage (idempotent) puis données de
  // démonstration si la base est vide (marque test DISTINCTION).
  await migrateDatabase();
  await seedIfEmpty();

  const app = express();
  const server = createServer(app);

  // Webhook Moneroo (5.6) : enregistré AVANT le parseur JSON afin de
  // conserver le corps brut pour la vérification de signature HMAC.
  app.post("/api/webhooks/moneroo", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""));
      if (!verifyMonerooSignature(raw, req.headers["x-moneroo-signature"] as string | undefined)) {
        res.status(401).json({ error: "signature invalide" });
        return;
      }
      const event = JSON.parse(raw.toString("utf8") || "{}");
      const paymentId = extractSucceededPaymentId(event);
      if (paymentId) {
        const db = await getDb();
        if (db) await markOnlinePaymentSucceeded(db, paymentId, String(event.data?.id ?? "webhook"));
      }
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("[Moneroo webhook]", error);
      res.status(200).json({ received: true });
    }
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API tRPC
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Les documents HTML ne doivent jamais venir d'un cache : le panneau
  // d'aperçu doit toujours exécuter la dernière version du code client
  // (sinon l'ancienne page de connexion reste dans le navigateur).
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && !/\.[a-zA-Z0-9]+$/.test(req.path)) {
      res.setHeader("Cache-Control", "no-store, must-revalidate");
      res.setHeader("X-App-Version", "2.1");
    }
    next();
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
