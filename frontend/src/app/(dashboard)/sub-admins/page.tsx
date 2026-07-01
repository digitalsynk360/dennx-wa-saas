"use client";

/**
 * Sub Admins page — mirrors the reference "Sub Admins" screen:
 * a table of members (name, email, role, online status) and a
 * "New Sub Admin" modal (full name, email, password, role picker).
 *
 * All mutations re-check permissions server-side
 * (members.manage) — the "Add Sub Admin" button is hidden client-
 * side for roles that lack it, but the API is the real guard.
 */
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { extractErrorMessage, useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { roleHasPermission } from "@/lib/permissions";
import { inviteMemberSchema, type InviteMemberFormValues } from "@/lib/validation";
import type { WorkspaceMemberResponse } from "@/types/workspace";

export default function SubAdminsPage() {
  const { activeWorkspace } = useAuth();
  const canManage = roleHasPermission(activeWorkspace?.role, "members.manage");

  const [members, setMembers] = useState<WorkspaceMemberResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteMemberFormValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { role_name: "Manager" },
  });

  const loadMembers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<WorkspaceMemberResponse[]>("/workspaces/current/members");
      setMembers(data);
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to load Sub Admins."));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) {
      loadMembers();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  const onSubmit = async (values: InviteMemberFormValues) => {
    setModalError(null);
    try {
      await api.post("/workspaces/current/members", values);
      reset({ role_name: "Manager" });
      setModalOpen(false);
      await loadMembers();
    } catch (err) {
      setModalError(extractErrorMessage(err, "Unable to add Sub Admin."));
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("Remove this Sub Admin from the workspace?")) return;
    try {
      await api.delete(`/workspaces/current/members/${memberId}`);
      await loadMembers();
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to remove Sub Admin."));
    }
  };

  const handleRoleChange = async (memberId: string, role_name: string) => {
    try {
      await api.patch(`/workspaces/current/members/${memberId}`, { role_name });
      await loadMembers();
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to update role."));
    }
  };

  if (!canManage) {
    return (
      <>
        <Topbar title="Sub Admins" />
        <div className="p-6">
          <Alert variant="destructive">
            You don&apos;t have permission to manage Sub Admins for this workspace.
          </Alert>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Sub Admins" />
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Sub Admins</h2>
            <p className="text-sm text-muted-foreground">
              Create admins with access to specific projects only
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Sub Admin
          </Button>
        </div>

        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

        <div className="overflow-hidden rounded-lg border border-border bg-white">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading...</p>
          ) : members.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No Sub Admins yet. Click &quot;Add Sub Admin&quot; to invite one.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{member.user.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{member.user.email}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={member.role.name}
                        onChange={(e) => handleRoleChange(member.id, e.target.value)}
                        className="h-8 w-32"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Manager">Manager</option>
                        <option value="Agent">Agent</option>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs ${
                          member.is_online ? "text-green-600" : "text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            member.is_online ? "bg-green-500" : "bg-gray-300"
                          }`}
                        />
                        {member.is_online ? "Online" : "Offline"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(member.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}>
        <DialogHeader>
          <DialogTitle>New Sub Admin</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            {modalError && <Alert variant="destructive">{modalError}</Alert>}

            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full Name</Label>
              <Input id="full_name" placeholder="Rahul Sharma" {...register("full_name")} />
              {errors.full_name && <p className="text-sm text-red-600">{errors.full_name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="demo@gmail.com" {...register("email")} />
              {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register("password")} />
              <p className="text-xs text-muted-foreground">
                Used only if this email doesn&apos;t already have an account.
              </p>
              {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role_name">Role</Label>
              <Select id="role_name" {...register("role_name")}>
                <option value="Admin">Admin — Full access in assigned projects</option>
                <option value="Manager">Manager — Can manage chats, campaigns, templates</option>
                <option value="Agent">Agent — Inbox only</option>
              </Select>
            </div>
          </DialogContent>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Sub Admin"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
