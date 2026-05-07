import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

function resolveColdSignerDistPath() {
  const candidates = [
    path.resolve(import.meta.dirname, "..", "cold-signer", "dist"),
    path.resolve(import.meta.dirname, "..", "dist", "cold-signer"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function mountColdSigner(app: Express) {
  const coldSignerDistPath = resolveColdSignerDistPath();

  if (!coldSignerDistPath) {
    log("cold-signer build not found; /cold-signer will not be served", "express");
    return;
  }

  app.use("/cold-signer", express.static(coldSignerDistPath));
  app.get(["/cold-signer", "/cold-signer/", "/cold-signer/*"], (req, res, next) => {
    if (path.extname(req.path)) {
      next();
      return;
    }

    res.sendFile(path.resolve(coldSignerDistPath, "index.html"));
  });
}

function resolveQbtcWalletDistPath() {
  const candidates = [
    path.resolve(import.meta.dirname, "..", "qbtc-wallet", "dist"),
    path.resolve(import.meta.dirname, "..", "dist", "qbtc-wallet"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function mountQbtcWallet(app: Express) {
  const distPath = resolveQbtcWalletDistPath();

  if (!distPath) {
    log("qbtc-wallet build not found; /qbtc-wallet will not be served", "express");
    return;
  }

  app.use("/qbtc-wallet", express.static(distPath));
  app.get(["/qbtc-wallet", "/qbtc-wallet/", "/qbtc-wallet/*"], (req, res, next) => {
    if (path.extname(req.path)) {
      next();
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  mountColdSigner(app);
  mountQbtcWallet(app);
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  mountColdSigner(app);
  mountQbtcWallet(app);
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
