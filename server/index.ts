// server/index.ts
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./vite";

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

// Your beautiful logging middleware – unchanged
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
      if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });
  next();
});

// ────── THIS IS THE ONLY IMPORTANT PART ──────
// Register all routes (including WebSockets init – they are harmless in serverless)
registerRoutes(app); // ← no await needed anymore (we’ll make it sync below)

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: err.message || "Internal Server Error" });
});

// Serve static client (Vite build → public/dist)
serveStatic(app);

// ────── VERCEL SERVERLESS EXPORT ──────
export default app; // ← This is what Vercel calls

// ────── LOCAL DEV ONLY ──────
if (process.env.NODE_ENV !== "production") {
  const port = parseInt(process.env.PORT || "5000", 10);
  const server = require("http").createServer(app);
  // Re-run the async parts that create the http.Server for HMR
  registerRoutes(app).then((httpServer: any) => {
    httpServer.listen(port, "0.0.0.0", () => {
      log(`Local dev server running on http://localhost:${port}`);
    });
  });
}
