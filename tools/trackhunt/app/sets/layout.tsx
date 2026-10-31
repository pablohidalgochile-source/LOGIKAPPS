import type { ReactNode } from "react";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function SetsLayout({ children }: { children: ReactNode }) {
  await requireChatGPTUser("/sets");
  return children;
}
