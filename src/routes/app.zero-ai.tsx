import { createFileRoute } from "@tanstack/react-router";
import { ZeroAIWorkspace } from "@/features/zeroAI/ZeroAIWorkspace";
export const Route = createFileRoute("/app/zero-ai")({ component: ZeroAIWorkspace });
