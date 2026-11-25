import { defineConfig } from "deepsec/config";
import { generatedMatchersPlugin } from "./generated-matchers.js";

export default defineConfig({
  defaultThinkingLevel: "xhigh", // <deepsec:default-thinking-level>
  defaultModel: "moonshotai/kimi-k3", // <deepsec:default-model>
  defaultAgent: "pi", // <deepsec:default-agent>
  ai: {"mode":"gateway","provider":"vercel"}, // <deepsec:model-route>
  projects: [
    { id: "nam-2026-conference", root: ".." },
    // <deepsec:projects-insert-above>
  ],
  plugins: [generatedMatchersPlugin],
});
