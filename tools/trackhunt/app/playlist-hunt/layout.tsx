import type { ReactNode } from "react";
import { requireChatGPTUser } from "../chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function PlaylistHuntLayout({ children }: { children: ReactNode }) {
  await requireChatGPTUser("/playlist-hunt");
  return children;
}
