import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(globalThis as any).__dirname = path.resolve(__dirname, "..");
(globalThis as any).__filename = path.resolve(__dirname, "..", "vite.config.ts");

import("./index.js");
