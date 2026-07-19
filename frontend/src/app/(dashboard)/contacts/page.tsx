"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2, Download, Pencil, Plus, Search, Tag as TagIcon,
  Trash2, Upload, Users, X,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, getErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ContactListResponse, ContactResponse, ImportResult, TagResponse } from "@/types/contacts";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [allTags, setAllTags] = useState<TagResponse[]>([]);
  const [filterTag, setFilterTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Add contact modal ──
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ phone: "", name: "", email: "", city: "" });
  const [saving, setSaving] = useState(false);

  // ── Edit contact modal ──
  const [editContact, setEditContact] = useState<ContactResponse | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", city: "" });
  const [editNewTag, setEditNewTag] = useState("");

  // ── Import popup flow ──
  const [importStep, setImportStep] = useState<"none" | "assign">("none");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importValidCount, setImportValidCount] = useState(0);
  const [importSelectedTags, setImportSelectedTags] = useState<Set<string>>(new Set());
  const [importNewTag, setImportNewTag] = useState("");
  const [importing, setImporting] = useState(false);

  const loadTags = useCallback(async () => {
    try {
      const { data } = await api.get<TagResponse[]>("/tags");
      setAllTags(data);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams({ page: String(page), page_size: "30" });
    if (search) params.set("search", search);
    try {
      const { data } = await api.get<ContactListResponse>(`/contacts?${params}`);
      setContacts(data.items);
      setTotal(data.total);
    } catch { setError("Failed to load contacts"); }
  }, [page, search]);

  useEffect(() => { load(); loadTags(); }, [load, loadTags]);

  const shown = filterTag
    ? contacts.filter((c) => c.tags.some((t) => t.id === filterTag))
    : contacts;

  // ── Create ──
  const handleCreate = async () => {
    setSaving(true); setError(null);
    try {
      await api.post("/contacts", {
        phone: form.phone.trim(), name: form.name.trim() || null,
        email: form.email.trim() || null, city: form.city.trim() || null,
      });
      setModalOpen(false);
      setForm({ phone: "", name: "", email: "", city: "" });
      setSuccess("Contact added!");
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to add contact"));
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    try { await api.delete(`/contacts/${id}`); await load(); }
    catch { setError("Delete failed"); }
  };

  const handleExport = async () => {
    try {
      const { data } = await api.get("/contacts/export", { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(data as Blob);
      a.download = "contacts.csv";
      a.click();
    } catch { setError("Export failed"); }
  };

  const downloadTemplate = () => {
    const csv = "phone,name,email,city\n+919876543210,Rahul Sharma,rahul@email.com,Delhi\n+918765432109,Priya Singh,priya@email.com,Mumbai";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "contacts_template.csv";
    a.click();
  };

  // ── Import flow: file select → count valid → popup ──
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        setError("CSV khali hai ya sirf header hai.");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
      const phoneIdx = header.indexOf("phone");
      if (phoneIdx === -1) {
        setError('CSV mein "phone" column nahi mila. Template download karke dekho.');
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      const seen = new Set<string>();
      let valid = 0;
      for (let i = 1; i < lines.length; i++) {
        const phone = (lines[i].split(",")[phoneIdx] || "").trim();
        if (phone && !seen.has(phone)) { seen.add(phone); valid++; }
      }
      if (valid === 0) {
        setError("Koi valid contact nahi mila CSV mein.");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      setImportFile(file);
      setImportValidCount(valid);
      setImportSelectedTags(new Set());
      setImportNewTag("");
      setImportStep("assign");
    };
    reader.readAsText(file);
  };

  const addImportNewTag = async () => {
    const name = importNewTag.trim();
    if (!name) return;
    try {
      const { data: tag } = await api.post<TagResponse>("/tags", { name, color: null });
      setAllTags((t) => [...t, tag]);
      setImportSelectedTags((s) => new Set(s).add(tag.id));
      setImportNewTag("");
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Tag create failed"));
    }
  };

  const confirmImport = async () => {
    if (!importFile) return;
    setImporting(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("tag_ids", [...importSelectedTags].join(","));
      const { data } = await api.post<ImportResult>("/contacts/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const errTxt = data.errors.length ? ` · ${data.errors.length} errors` : "";
      setSuccess(`✅ ${data.created} imported · ${data.skipped} skipped${errTxt}`);
      closeImport();
      await load();
    } catch {
      setError("Import failed — CSV format check karo.");
    } finally { setImporting(false); }
  };

  const closeImport = () => {
    setImportStep("none");
    setImportFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Edit flow ──
  const openEdit = (c: ContactResponse) => {
    setEditContact(c);
    setEditForm({ name: c.name || "", email: c.email || "", city: c.city || "" });
    setEditNewTag("");
  };

  const saveEdit = async () => {
    if (!editContact) return;
    setSaving(true); setError(null);
    try {
      const { data } = await api.patch<ContactResponse>(`/contacts/${editContact.id}`, {
        name: editForm.name.trim() || null,
        email: editForm.email.trim() || null,
        city: editForm.city.trim() || null,
      });
      setEditContact(data);
      setSuccess("Contact updated!");
      await load();
    } catch { setError("Update failed"); }
    finally { setSaving(false); }
  };

  const editAttachTag = async (tagId: string) => {
    if (!editContact) return;
    try {
      const { data } = await api.post<ContactResponse>(`/contacts/${editContact.id}/tags`, { tag_ids: [tagId] });
      setEditContact(data);
      await load();
    } catch { setError("Tag add failed"); }
  };

  const editRemoveTag = async (tagId: string) => {
    if (!editContact) return;
    try {
      const { data } = await api.delete<ContactResponse>(`/contacts/${editContact.id}/tags/${tagId}`);
      setEditContact(data);
      await load();
    } catch { setError("Tag remove failed"); }
  };

  const editCreateTag = async () => {
    const name = editNewTag.trim();
    if (!name || !editContact) return;
    try {
      const { data: tag } = await api.post<TagResponse>("/tags", { name, color: null });
      setAllTags((t) => [...t, tag]);
      setEditNewTag("");
      await editAttachTag(tag.id);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Tag create failed"));
    }
  };

  return (
    <>
      <Topbar title="Contacts" />
      <div className="p-4 sm:p-6">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name or phone..."
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4" /> Export CSV</Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate} title="Download CSV template"><Download className="h-4 w-4" /> Template</Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import CSV</Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelected} />
            <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> New Contact</Button>
          </div>
        </div>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              onClick={() => setFilterTag("")}
              className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", !filterTag ? "bg-primary text-white" : "border border-border bg-white text-muted-foreground hover:border-primary hover:text-primary")}
            >
              All
            </button>
            {allTags.map((t) => (
              <button
                key={t.id}
                onClick={() => setFilterTag(t.id === filterTag ? "" : t.id)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", filterTag === t.id ? "bg-primary text-white" : "border border-border bg-white text-muted-foreground hover:border-primary hover:text-primary")}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Tags</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{c.name || "—"}</td>
                    <td className="px-4 py-3">{c.phone}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.length ? c.tags.map((t) => (
                          <span key={t.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            {t.name}
                          </span>
                        )) : <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.city || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{c.source}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} className="text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    <Users className="mx-auto mb-2 h-8 w-8" />
                    No contacts {filterTag ? "with this tag" : "yet"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {total > 30 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-sm">
              <span className="text-muted-foreground">{total} contacts</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page * 30 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── New Contact Modal ── */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}>
        <DialogHeader><DialogTitle>New Contact</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-1.5">
            <Label>Phone * (with country code)</Label>
            <Input placeholder="+919876543210" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="Rahul Sharma" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !form.phone.trim()}>{saving ? "Adding..." : "Add Contact"}</Button>
        </DialogFooter>
      </Dialog>

      {/* ── Import Assign-Tags Popup ── */}
      <Dialog open={importStep === "assign"} onClose={closeImport}>
        <DialogHeader><DialogTitle>Import Contacts</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
            <p className="text-sm font-medium text-green-800">
              We found <span className="font-bold">{importValidCount}</span> valid contact{importValidCount !== 1 ? "s" : ""} in your file
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Assign to group(s) — optional</Label>
            <p className="text-xs text-muted-foreground">Selected groups sab imported contacts pe lagenge. Multiple select kar sakte ho.</p>
            {allTags.length > 0 && (
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2">
                {allTags.map((t) => {
                  const selected = importSelectedTags.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setImportSelectedTags((s) => {
                        const next = new Set(s);
                        if (selected) next.delete(t.id); else next.add(t.id);
                        return next;
                      })}
                      className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", selected ? "bg-primary text-white" : "border border-border bg-white text-muted-foreground hover:border-primary hover:text-primary")}
                    >
                      {selected && "✓ "}{t.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Or create new group</Label>
            <div className="flex gap-2">
              <Input
                value={importNewTag}
                onChange={(e) => setImportNewTag(e.target.value)}
                placeholder="Group name — Enter to add"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImportNewTag(); } }}
              />
              <Button variant="outline" onClick={addImportNewTag} disabled={!importNewTag.trim()}>Add</Button>
            </div>
          </div>

          {importSelectedTags.size > 0 && (
            <p className="text-xs text-muted-foreground">
              {importSelectedTags.size} group{importSelectedTags.size > 1 ? "s" : ""} selected
            </p>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={closeImport} disabled={importing}>Cancel</Button>
          <Button onClick={confirmImport} disabled={importing}>
            {importing ? "Importing..." : `Confirm Import (${importValidCount})`}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Edit Contact Modal ── */}
      <Dialog open={editContact !== null} onClose={() => setEditContact(null)}>
        <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
        <DialogContent>
          {editContact && (
            <>
              <p className="text-sm text-muted-foreground">📱 {editContact.phone}</p>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>City</Label>
                  <Input value={editForm.city} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} />
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><TagIcon className="h-3.5 w-3.5" /> Tags / Groups</Label>
                <div className="flex flex-wrap gap-1.5">
                  {editContact.tags.map((t) => (
                    <span key={t.id} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {t.name}
                      <button onClick={() => editRemoveTag(t.id)} className="rounded-full hover:bg-primary/20">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {editContact.tags.length === 0 && <span className="text-xs text-muted-foreground">No tags</span>}
                </div>
                {/* Available tags */}
                {allTags.filter((t) => !editContact.tags.some((ct) => ct.id === t.id)).length > 0 && (
                  <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2">
                    {allTags
                      .filter((t) => !editContact.tags.some((ct) => ct.id === t.id))
                      .map((t) => (
                        <button
                          key={t.id}
                          onClick={() => editAttachTag(t.id)}
                          className="rounded-full border border-border bg-white px-2 py-0.5 text-xs hover:border-primary hover:text-primary"
                        >
                          + {t.name}
                        </button>
                      ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={editNewTag}
                    onChange={(e) => setEditNewTag(e.target.value)}
                    placeholder="New tag — Enter to add"
                    className="h-8 text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); editCreateTag(); } }}
                  />
                  <Button variant="outline" size="sm" onClick={editCreateTag} disabled={!editNewTag.trim()}>Add</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditContact(null)}>Close</Button>
          <Button onClick={saveEdit} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}