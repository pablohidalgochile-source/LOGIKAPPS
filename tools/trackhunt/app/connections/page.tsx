import { requireChatGPTUser } from "../chatgpt-auth";
import ConnectionsClient from "./connections-client";
import "./connections.css";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const user = await requireChatGPTUser("/connections");
  return <ConnectionsClient initialName={user.displayName} />;
}

