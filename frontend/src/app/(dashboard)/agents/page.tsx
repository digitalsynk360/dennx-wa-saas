"use client";
import { useEffect, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { api } from "@/lib/api";
import type { AgentResponse } from "@/types/billing";

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AgentResponse[]>("/agents")
      .then(({ data }) => setAgents(data))
      .catch(() => setError("Failed to load agents"));
  }, []);

  return (
    <>
      <Topbar title="Agents" />
      <div className="p-6">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        <p className="text-sm text-muted-foreground mb-4">
          Live status and workload for everyone on your team. Manage roles in Sub Admins.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div key={agent.member_id} className="rounded-lg border border-border bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{agent.full_name}</p>
                  <p className="text-xs text-muted-foreground">{agent.email}</p>
                </div>
                <span className={`flex items-center gap-1.5 text-xs ${agent.is_online ? "text-green-600" : "text-muted-foreground"}`}>
                  <span className={`h-2 w-2 rounded-full ${agent.is_online ? "bg-green-500" : "bg-gray-300"}`} />
                  {agent.is_online ? "Online" : "Offline"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="rounded bg-muted px-2 py-0.5 text-xs">{agent.role}</span>
                <span className="text-muted-foreground">{agent.open_conversations_assigned} open chats</span>
              </div>
            </div>
          ))}
          {agents.length === 0 && !error && (
            <p className="text-sm text-muted-foreground col-span-full text-center py-8">No agents yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
