import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

globalThis.__dirname = rootDir;
globalThis.__filename = path.join(rootDir, "vite.config.ts");
