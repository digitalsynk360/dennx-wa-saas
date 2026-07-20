"use client";
import { useCallback, useEffect, useState } from "react";
import { Mail, MessageSquare, Phone, Plus, Trash2, UserCheck, UserMinus, Users } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";
import type { AgentResponse } from "@/types/billing";
import type { RoleResponse, WorkspaceMemberResponse } from "@/types/workspace";

type Role = RoleResponse;
type Member = WorkspaceMemberResponse;

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentResponse[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ag, mb, rl] = await Promise.all([
        api.get<AgentResponse[]>("/agents"),
        api.get<Member[]>("/workspaces/current/members"),
        api.get<Role[]>("/workspaces/roles"),
      ]);
      setAgents(ag.data);
      setMembers(mb.data);
      setRoles(rl.data);
    } catch { setError("Failed to load team"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async () => {
    setSaving(true); setError(null);
    try {
      await api.post("/workspaces/current/members", { email: inviteEmail, role_name: inviteRole });
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false); setInviteEmail(""); setInviteRole("agent");
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Invite failed"));
    } finally { setSaving(false); }
  };

  const handleRemove = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from workspace?`)) return;
    try {
      await api.delete(`/workspaces/current/members/${memberId}`);
      setSuccess(`${name} removed`);
      await load();
    } catch { setError("Remove failed"); }
  };

  const totalOpen = agents.reduce((s, a) => s + a.open_conversations_assigned, 0);
  const online = agents.filter((a) => a.is_online).length;

  return (
    <>
      <Topbar title="Agents" />
      <div className="p-4 sm:p-6">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Users, label: "Total Agents", value: agents.length },
            { icon: UserCheck, label: "Online Now", value: online },
            { icon: MessageSquare, label: "Open Chats", value: totalOpen },
            { icon: Phone, label: "Team Members", value: members.length },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-xl border border-border bg-white p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xl font-bold">{s.value}</span>
                <span className="block text-xs text-muted-foreground">{s.label}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Invite button */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Team Members</h2>
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <Plus className="h-4 w-4" /> Invite Member
          </Button>
        </div>

        {/* Members list */}
        <div className="mb-8 rounded-lg border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => {
                  const agent = agents.find((a) => a.email === m.user.email);
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-3 font-medium">{m.user.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.user.email}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{m.role.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1.5 text-xs ${agent?.is_online ? "text-green-600" : "text-muted-foreground"}`}>
                          <span className={`h-2 w-2 rounded-full ${agent?.is_online ? "bg-green-500" : "bg-gray-300"}`} />
                          {agent?.is_online ? `Online · ${agent.open_conversations_assigned} chats` : "Offline"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleRemove(m.id, m.user.full_name)}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          <UserMinus className="h-3.5 w-3.5" /> Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {members.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No members yet — invite your team!</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live agent cards */}
        <h2 className="mb-3 text-sm font-semibold">Live Workload</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div key={agent.member_id} className="rounded-xl border border-border bg-white p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{agent.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{agent.email}</p>
                </div>
                <span className={`flex flex-shrink-0 items-center gap-1.5 text-xs ${agent.is_online ? "text-green-600" : "text-muted-foreground"}`}>
                  <span className={`h-2 w-2 rounded-full ${agent.is_online ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
                  {agent.is_online ? "Online" : "Offline"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{agent.role}</span>
                <span className="flex items-center gap-1 text-sm font-semibold">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  {agent.open_conversations_assigned} open
                </span>
              </div>
            </div>
          ))}
          {agents.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No agents yet.</p>
          )}
        </div>
      </div>

      {/* Invite modal */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-1.5">
            <Label>Email address *</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="agent@company.com"
                className="pl-9"
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r.name} value={r.name}>{r.name}</option>
              ))}
              {roles.length === 0 && (
                <>
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </>
              )}
            </Select>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
          <Button onClick={handleInvite} disabled={saving || !inviteEmail}>
            {saving ? "Sending..." : "Send Invite"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}