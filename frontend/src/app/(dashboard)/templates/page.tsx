"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, CheckCircle2, FileText, Image as ImageIcon, Link2, Megaphone,
  Phone, Plus, RefreshCw, Search, Send, Settings2, ShieldCheck, Trash2,
  Type, Video, X,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TemplateButton, TemplateListResponse, TemplateResponse } from "@/types/templates";

const LANGUAGES = [
  { code: "en", label: "🇺🇸 English" },
  { code: "en_US", label: "🇺🇸 English (US)" },
  { code: "en_GB", label: "🇬🇧 English (UK)" },
  { code: "hi", label: "🇮🇳 Hindi" },
  { code: "mr", label: "🇮🇳 Marathi" },
  { code: "gu", label: "🇮🇳 Gujarati" },
  { code: "ta", label: "🇮🇳 Tamil" },
  { code: "te", label: "🇮🇳 Telugu" },
  { code: "kn", label: "🇮🇳 Kannada" },
  { code: "ml", label: "🇮🇳 Malayalam" },
  { code: "pa", label: "🇮🇳 Punjabi" },
  { code: "bn", label: "🇧🇩 Bengali" },
  { code: "ur", label: "🇵🇰 Urdu" },
  { code: "ar", label: "🇸🇦 Arabic" },
  { code: "es", label: "🇪🇸 Spanish" },
  { code: "pt_BR", label: "🇧🇷 Portuguese (BR)" },
  { code: "fr", label: "🇫🇷 French" },
  { code: "de", label: "🇩🇪 German" },
  { code: "id", label: "🇮🇩 Indonesian" },
  { code: "zh_CN", label: "🇨🇳 Chinese (Simplified)" },
  { code: "ru", label: "🇷🇺 Russian" },
  { code: "ja", label: "🇯🇵 Japanese" },
];

const CATEGORIES = [
  { id: "MARKETING", icon: Megaphone, title: "Marketing", desc: "Offers & promotions" },
  { id: "UTILITY", icon: Settings2, title: "Utility", desc: "Order, alerts, updates" },
  { id: "AUTHENTICATION", icon: ShieldCheck, title: "Authentication", desc: "OTP, login codes" },
];

const HEADER_TYPES = [
  { id: "none", icon: X, label: "None" },
  { id: "text", icon: Type, label: "Text" },
  { id: "image", icon: ImageIcon, label: "Image" },
  { id: "document", icon: FileText, label: "Document" },
  { id: "video", icon: Video, label: "Video" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

interface CreatorState {
  name: string;
  language: string;
  category: string;
  headerType: string;
  headerText: string;
  headerFile: File | null;
  body: string;
  footer: string;
  buttons: TemplateButton[];
}

const EMPTY_CREATOR: CreatorState = {
  name: "", language: "en", category: "",
  headerType: "none", headerText: "", headerFile: null,
  body: "", footer: "", buttons: [],
};

function fmt(text: string) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/_([^_\n]+)_/g, "<i>$1</i>")
    .replace(/~([^~\n]+)~/g, "<s>$1</s>")
    .replace(/\{\{(\d+)\}\}/g, '<span style="background:#fef3c7;color:#92400e;border-radius:3px;padding:0 3px;font-weight:600">{{$1}}</span>')
    .replace(/\n/g, "<br/>");
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [c, setC] = useState<CreatorState>({ ...EMPTY_CREATOR });
  const [langSearch, setLangSearch] = useState("");
  const [langOpen, setLangOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<TemplateListResponse>("/templates");
      setTemplates(data.items);
    } catch { setError("Failed to load templates"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    try { await api.post("/templates/sync"); setSuccess("Synced from Meta"); await load(); }
    catch { setError("Sync failed"); }
  };

  const handleSubmit = async (id: string) => {
    try { await api.post(`/templates/${id}/submit`); setSuccess("Submitted to Meta for approval"); await load(); }
    catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Submit failed — WhatsApp account connected hai?");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try { await api.delete(`/templates/${id}`); await load(); }
    catch { setError("Delete failed"); }
  };

  const nameValid = /^[a-z0-9_]+$/.test(c.name) && c.name.length > 0;
  const bodyValid = c.body.trim().length > 0 && c.body.length <= 1024;
  const headerValid = c.headerType === "none" ||
    (c.headerType === "text" ? c.headerText.trim().length > 0 && c.headerText.length <= 60 : c.headerFile !== null);
  const buttonsValid = c.buttons.every((b) =>
    b.text.trim() && (b.type !== "URL" || (b.url || "").trim()) && (b.type !== "PHONE_NUMBER" || (b.phone_number || "").trim())
  );
  const categoryValid = c.category !== "";
  const canSubmit = nameValid && categoryValid && bodyValid && headerValid && buttonsValid;

  const bodyVars = [...new Set(c.body.match(/\{\{\d+\}\}/g) || [])];

  const insertVar = (v: string) => {
    const ta = bodyRef.current;
    if (!ta) { setC((s) => ({ ...s, body: s.body + v })); return; }
    const start = ta.selectionStart ?? c.body.length;
    const end = ta.selectionEnd ?? c.body.length;
    const next = c.body.slice(0, start) + v + c.body.slice(end);
    setC((s) => ({ ...s, body: next }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + v.length;
    });
  };

  const quickReplyCount = c.buttons.filter((b) => b.type === "QUICK_REPLY").length;
  const urlCount = c.buttons.filter((b) => b.type === "URL").length;
  const phoneCount = c.buttons.filter((b) => b.type === "PHONE_NUMBER").length;

  const addButton = (type: string) => {
    setC((s) => ({ ...s, buttons: [...s.buttons, { type, text: "", url: type === "URL" ? "" : undefined, phone_number: type === "PHONE_NUMBER" ? "" : undefined }] }));
  };

  const updateButton = (i: number, patch: Partial<TemplateButton>) => {
    setC((s) => ({ ...s, buttons: s.buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) }));
  };

  const removeButton = (i: number) => {
    setC((s) => ({ ...s, buttons: s.buttons.filter((_, idx) => idx !== i) }));
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > 5 * 1024 * 1024) {
      setError("File 5 MB se badi hai.");
      return;
    }
    setC((s) => ({ ...s, headerFile: file }));
  };

  const createTemplate = async () => {
    setSaving(true); setError(null);
    try {
      await api.post("/templates", {
        name: c.name,
        language: c.language,
        category: c.category,
        header_type: c.headerType,
        header_content: c.headerType === "text" ? c.headerText : (c.headerFile?.name || null),
        body_text: c.body,
        footer_text: c.footer.trim() || null,
        buttons: c.buttons,
        variable_samples: {},
      });
      setSuccess("Template created as draft! Table mein Submit button se Meta approval bhejo.");
      setCreatorOpen(false);
      setC({ ...EMPTY_CREATOR });
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof msg === "string" ? msg : "Create failed — name unique hona chahiye.");
    } finally { setSaving(false); }
  };

  const checklist = [
    { label: "Template Name", ok: nameValid },
    { label: "Language", ok: !!c.language },
    { label: "Category", ok: categoryValid },
    { label: "Header", ok: headerValid },
    { label: "Body Text", ok: bodyValid },
    { label: "Variables", ok: true },
    { label: "Footer", ok: c.footer.length <= 60 },
    { label: "Buttons", ok: buttonsValid },
  ];

  const selectedLang = LANGUAGES.find((l) => l.code === c.language);

  return (
    <>
      <Topbar title="Templates" />
      <div className="p-4 sm:p-6">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Message Templates</h2>
            <p className="text-sm text-muted-foreground">Meta-approved templates for campaigns</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSync}>
              <RefreshCw className="h-4 w-4" /> Sync from Meta
            </Button>
            <Button size="sm" onClick={() => { setC({ ...EMPTY_CREATOR }); setCreatorOpen(true); }}>
              <Plus className="h-4 w-4" /> Create Template
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{t.name}</p>
                      <p className="max-w-xs truncate text-xs text-muted-foreground">{t.body_text}</p>
                    </td>
                    <td className="px-4 py-3 capitalize">{t.category.toLowerCase()}</td>
                    <td className="px-4 py-3">{t.language}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded px-2 py-0.5 text-xs font-medium capitalize", STATUS_COLORS[t.status] || "bg-gray-100")}>
                        {t.status}
                      </span>
                      {t.rejection_reason && (
                        <p className="mt-0.5 max-w-[180px] truncate text-[10px] text-red-500" title={t.rejection_reason}>{t.rejection_reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {(t.status === "draft" || t.status === "pending") && (
                          <Button variant="outline" size="sm" onClick={() => handleSubmit(t.id)} title="Submit for Meta approval">
                            <Send className="h-3.5 w-3.5" /> Submit
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} className="text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {templates.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No templates yet — create one!</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {creatorOpen && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex h-full w-full flex-col overflow-hidden bg-white sm:h-[92vh] sm:max-w-6xl sm:rounded-2xl sm:shadow-2xl">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
              <div>
                <h2 className="text-lg font-semibold">Create WhatsApp Template</h2>
                <p className="text-xs text-muted-foreground">Meta approval ke liye template banao</p>
              </div>
              <button onClick={() => setCreatorOpen(false)} className="rounded-lg p-2 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
              {/* LEFT: Form */}
              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                {/* 1. Name */}
                <div className="space-y-1.5">
                  <Label>Template Name <span className="text-red-500">*</span></Label>
                  <Input
                    value={c.name}
                    onChange={(e) => setC((s) => ({ ...s, name: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                    placeholder="order_confirmed"
                    className={cn(c.name && !nameValid && "border-red-400")}
                  />
                  <p className={cn("text-xs", c.name && !nameValid ? "text-red-500" : "text-muted-foreground")}>
                    Lowercase + underscores only
                  </p>
                </div>

                {/* 2. Language */}
                <div className="relative space-y-1.5">
                  <Label>Language <span className="text-red-500">*</span></Label>
                  <button
                    type="button"
                    onClick={() => setLangOpen((v) => !v)}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <span>{selectedLang?.label || c.language}</span>
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {langOpen && (
                    <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-white shadow-lg">
                      <div className="border-b border-border p-2">
                        <Input
                          autoFocus
                          value={langSearch}
                          onChange={(e) => setLangSearch(e.target.value)}
                          placeholder="Search language..."
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {LANGUAGES.filter((l) => l.label.toLowerCase().includes(langSearch.toLowerCase())).map((l) => (
                          <button
                            key={l.code}
                            onClick={() => { setC((s) => ({ ...s, language: l.code })); setLangOpen(false); setLangSearch(""); }}
                            className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted", l.code === c.language && "bg-muted font-medium")}
                          >
                            {l.label}
                            {l.code === c.language && <Check className="h-4 w-4 text-primary" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Category cards */}
                <div className="space-y-1.5">
                  <Label>Category <span className="text-red-500">*</span></Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setC((s) => ({ ...s, category: cat.id }))}
                        className={cn(
                          "rounded-xl border-2 p-3 text-left transition-all",
                          c.category === cat.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        )}
                      >
                        <cat.icon className={cn("mb-1.5 h-5 w-5", c.category === cat.id ? "text-primary" : "text-muted-foreground")} />
                        <p className="text-sm font-semibold">{cat.title}</p>
                        <p className="text-xs text-muted-foreground">{cat.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Header */}
                <div className="space-y-1.5">
                  <Label>Header <span className="text-muted-foreground">(optional)</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {HEADER_TYPES.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setC((s) => ({ ...s, headerType: h.id, headerText: "", headerFile: null }))}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                          c.headerType === h.id ? "border-primary bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/40"
                        )}
                      >
                        <h.icon className="h-3.5 w-3.5" /> {h.label}
                      </button>
                    ))}
                  </div>
                  {c.headerType === "text" && (
                    <div>
                      <Input
                        value={c.headerText}
                        onChange={(e) => setC((s) => ({ ...s, headerText: e.target.value.slice(0, 60) }))}
                        placeholder="Header text..."
                      />
                      <p className="mt-1 text-right text-xs text-muted-foreground">{c.headerText.length}/60</p>
                    </div>
                  )}
                  {["image", "document", "video"].includes(c.headerType) && (
                    <div className="rounded-xl border-2 border-dashed border-border p-4 text-center">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          accept={c.headerType === "image" ? ".jpg,.jpeg,.png" : c.headerType === "video" ? ".mp4" : ".pdf,.doc,.docx"}
                          onChange={handleFile}
                        />
                        <p className="text-sm font-medium text-primary">
                          Click to upload {c.headerType} ({c.headerType === "image" ? "JPG/PNG, max 5 MB" : c.headerType === "video" ? "MP4" : "PDF/DOC/DOCX"})
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {c.headerFile ? `📎 ${c.headerFile.name}` : "No file chosen"}
                        </p>
                      </label>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        File is uploaded to Meta for template review. Meta requires actual files (not URLs) for media headers.
                      </p>
                    </div>
                  )}
                </div>

                {/* 5. Body */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Body Text <span className="text-red-500">*</span></Label>
                    <div className="flex gap-1.5">
                      {["{{1}}", "{{2}}", "{{3}}"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => insertVar(v)}
                          className="rounded-md border border-border bg-white px-2 py-0.5 font-mono text-xs hover:border-primary hover:text-primary"
                        >
                          +{v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    ref={bodyRef}
                    value={c.body}
                    onChange={(e) => setC((s) => ({ ...s, body: e.target.value.slice(0, 1024) }))}
                    rows={5}
                    placeholder={"Hello {{1}},\nYour order *{{2}}* is confirmed! 🎉\nDelivery: {{3}}"}
                    className="w-full resize-y rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>*bold* _italic_ ~strikethrough~</span>
                    <span>{c.body.length}/1024</span>
                  </div>
                </div>

                {/* 6. Footer */}
                <div className="space-y-1.5">
                  <Label>Footer <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    value={c.footer}
                    onChange={(e) => setC((s) => ({ ...s, footer: e.target.value.slice(0, 60) }))}
                    placeholder="Reply STOP to unsubscribe"
                  />
                  <p className="text-right text-xs text-muted-foreground">{c.footer.length}/60</p>
                </div>

                {/* 7. Buttons */}
                <div className="space-y-2">
                  <Label>Buttons <span className="text-muted-foreground">(optional)</span></Label>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" disabled={quickReplyCount >= 3} onClick={() => addButton("QUICK_REPLY")}>
                      <Plus className="h-3.5 w-3.5" /> Quick Reply {quickReplyCount > 0 && `(${quickReplyCount}/3)`}
                    </Button>
                    <Button variant="outline" size="sm" disabled={urlCount >= 2} onClick={() => addButton("URL")}>
                      <Link2 className="h-3.5 w-3.5" /> Visit Website {urlCount > 0 && `(${urlCount}/2)`}
                    </Button>
                    <Button variant="outline" size="sm" disabled={phoneCount >= 1} onClick={() => addButton("PHONE_NUMBER")}>
                      <Phone className="h-3.5 w-3.5" /> Call Number
                    </Button>
                  </div>
                  {c.buttons.map((b, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2">
                      <span className="mt-2 whitespace-nowrap rounded border border-border bg-white px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {b.type === "QUICK_REPLY" ? "Quick Reply" : b.type === "URL" ? "URL" : "Call"}
                      </span>
                      <div className="flex-1 space-y-1.5">
                        <Input
                          value={b.text}
                          onChange={(e) => updateButton(i, { text: e.target.value.slice(0, 25) })}
                          placeholder="Button text (max 25)"
                          className="h-8 text-sm"
                        />
                        {b.type === "URL" && (
                          <Input
                            value={b.url || ""}
                            onChange={(e) => updateButton(i, { url: e.target.value })}
                            placeholder="https://example.com"
                            className="h-8 text-sm"
                          />
                        )}
                        {b.type === "PHONE_NUMBER" && (
                          <Input
                            value={b.phone_number || ""}
                            onChange={(e) => updateButton(i, { phone_number: e.target.value })}
                            placeholder="+919876543210"
                            className="h-8 text-sm"
                          />
                        )}
                      </div>
                      <button onClick={() => removeButton(i)} className="mt-2 rounded p-1 text-muted-foreground hover:text-red-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT: Preview + checklist */}
              <div className="w-full flex-shrink-0 space-y-4 overflow-y-auto border-t border-border p-5 lg:w-[380px] lg:border-l lg:border-t-0" style={{ backgroundColor: "hsl(90,20%,94%)" }}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live Preview</p>

                <div className="rounded-2xl p-3" style={{ backgroundColor: "hsl(90,25%,90%)" }}>
                  <div className="max-w-[95%] rounded-lg rounded-tl-none bg-white p-2.5 shadow-sm">
                    {c.headerType === "text" && c.headerText && (
                      <p className="mb-1 text-sm font-bold">{c.headerText}</p>
                    )}
                    {c.headerType === "image" && (
                      <div className="mb-1.5 flex h-32 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                        {c.headerFile ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={URL.createObjectURL(c.headerFile)} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-gray-300" />
                        )}
                      </div>
                    )}
                    {c.headerType === "video" && (
                      <div className="mb-1.5 flex h-32 items-center justify-center rounded-lg bg-gray-800">
                        <Video className="h-8 w-8 text-white/60" />
                      </div>
                    )}
                    {c.headerType === "document" && (
                      <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-gray-100 p-2.5">
                        <FileText className="h-6 w-6 text-red-500" />
                        <span className="truncate text-xs">{c.headerFile?.name || "document.pdf"}</span>
                      </div>
                    )}
                    <div
                      className="whitespace-pre-wrap break-words text-sm text-gray-800"
                      dangerouslySetInnerHTML={{ __html: c.body ? fmt(c.body) : '<span style="color:#9ca3af">Body text yahan dikhega...</span>' }}
                    />
                    {c.footer && <p className="mt-1 text-xs text-gray-400">{c.footer}</p>}
                    <p className="mt-0.5 text-right text-[10px] text-gray-400">
                      {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {c.buttons.length > 0 && (
                    <div className="mt-1 max-w-[95%] space-y-1">
                      {c.buttons.map((b, i) => (
                        <div key={i} className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-center text-sm font-medium text-sky-600 shadow-sm">
                          {b.type === "URL" && <Link2 className="h-3.5 w-3.5" />}
                          {b.type === "PHONE_NUMBER" && <Phone className="h-3.5 w-3.5" />}
                          {b.text || "Button"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {bodyVars.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Variables detected: {bodyVars.join(", ")}</p>
                )}

                <div className="rounded-xl border border-border bg-white p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checklist</p>
                  <div className="space-y-1">
                    {checklist.map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-sm">
                        {item.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <span className="h-4 w-4 rounded-full border-2 border-gray-300" />
                        )}
                        <span className={item.ok ? "text-gray-700" : "text-muted-foreground"}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center justify-between border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setCreatorOpen(false)}>Cancel</Button>
              <Button onClick={createTemplate} disabled={!canSubmit || saving}>
                {saving ? "Creating..." : "Submit for Meta Approval"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}