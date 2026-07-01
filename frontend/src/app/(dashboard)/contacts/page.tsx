"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Plus, Search, Trash2, Upload } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { ContactListResponse, ContactResponse, ImportResult } from "@/types/contacts";

const STATUS_OPTIONS = ["new", "contacted", "converted", "lost"];
const SOURCE_OPTIONS = ["manual", "inbound", "import", "api", "campaign"];

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ phone: "", name: "", email: "", city: "", status: "new", source: "manual" });
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams({ page: String(page), page_size: "30" });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    try {
      const { data } = await api.get<ContactListResponse>(`/contacts?${params}`);
      setContacts(data.items);
      setTotal(data.total);
    } catch { setError("Failed to load contacts"); }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.phone) return;
    setSaving(true);
    try {
      await api.post("/contacts", form);
      setAddOpen(false);
      setForm({ phone: "", name: "", email: "", city: "", status: "new", source: "manual" });
      await load();
      setSuccess("Contact added successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to add contact");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    try { await api.delete(`/contacts/${id}`); await load(); }
    catch { setError("Failed to delete contact"); }
  };

  const handleExport = async () => {
    try {
      const response = await api.get("/contacts/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
      const a = document.createElement("a"); a.href = url; a.download = "contacts.csv"; a.click();
    } catch { setError("Export failed"); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await api.post<ImportResult>("/contacts/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSuccess(`Imported: ${data.created} created, ${data.skipped} skipped`);
      await load();
    } catch { setError("Import failed"); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const pageSize = 30;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <Topbar title="Contacts" />
      <div className="p-6">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name, phone, email..." className="pl-8 w-64"
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-36">
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4" /> Export CSV</Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import CSV</Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Contact</Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Opted</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No contacts found.</td></tr>
              )}
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{c.name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.city || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">{c.source}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      c.status === "converted" ? "bg-green-100 text-green-700" :
                      c.status === "lost" ? "bg-red-100 text-red-700" :
                      "bg-muted text-muted-foreground"}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${c.opted_in ? "text-green-600" : "text-red-500"}`}>
                      {c.opted_in ? "✓ Active" : "✗ Opted out"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} className="text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {contacts.length} of {total} contacts</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="px-2 py-1">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)}>
        <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-1.5">
            <Label>Phone *</Label>
            <Input placeholder="+919876543210" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="John Doe" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={saving || !form.phone}>{saving ? "Adding..." : "Add Contact"}</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
