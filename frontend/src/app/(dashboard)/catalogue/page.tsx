"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown, ImageOff, Package, Pencil, Plus, Search,
  Tag, Trash2, X,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Category { id: string; name: string; description: string | null; sort_order: number }
interface Product {
  id: string; name: string; description: string | null;
  price: number; currency: string; sku: string | null;
  image_url: string | null; stock: number | null;
  is_active: boolean; category_id: string | null; category_name: string | null;
}

const EMPTY_PRODUCT = {
  name: "", description: "", price: 0, currency: "INR",
  sku: "", image_url: "", stock: "", category_id: "", is_active: true,
};

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(price / 100);
}

export default function CataloguePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modals
  const [productModal, setProductModal] = useState<"add" | "edit" | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({ ...EMPTY_PRODUCT });
  const [catModal, setCatModal] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [catRes, prodRes] = await Promise.all([
        api.get<Category[]>("/catalogue/categories"),
        api.get<Product[]>("/catalogue/products"),
      ]);
      setCategories(catRes.data);
      setProducts(prodRes.data);
    } catch { setError("Failed to load catalogue"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || p.category_id === filterCat;
    return matchSearch && matchCat;
  });

  const openAdd = () => { setProductForm({ ...EMPTY_PRODUCT }); setEditProduct(null); setProductModal("add"); };
  const openEdit = (p: Product) => {
    setEditProduct(p);
    setProductForm({
      name: p.name, description: p.description || "",
      price: p.price, currency: p.currency,
      sku: p.sku || "", image_url: p.image_url || "",
      stock: p.stock == null ? "" : String(p.stock),
      category_id: p.category_id || "", is_active: p.is_active,
    });
    setProductModal("edit");
  };

  const handleSaveProduct = async () => {
    setSaving(true); setError(null);
    try {
      const payload = {
        name: productForm.name.trim(),
        description: productForm.description.trim() || null,
        price: Number(productForm.price) || 0,
        currency: productForm.currency,
        sku: productForm.sku.trim() || null,
        image_url: productForm.image_url.trim() || null,
        stock: productForm.stock === "" ? null : Number(productForm.stock),
        category_id: productForm.category_id || null,
        is_active: productForm.is_active,
      };
      if (productModal === "add") {
        await api.post("/catalogue/products", payload);
        setSuccess("Product added!");
      } else if (editProduct) {
        await api.patch(`/catalogue/products/${editProduct.id}`, payload);
        setSuccess("Product updated!");
      }
      setProductModal(null);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Save failed");
    } finally { setSaving(false); }
  };

  const handleToggle = async (p: Product) => {
    try {
      await api.patch(`/catalogue/products/${p.id}/toggle`);
      await load();
    } catch { setError("Toggle failed"); }
  };

  const handleDelete = async (p: Product) => {
    if (!confirm(`"${p.name}" delete karo?`)) return;
    try { await api.delete(`/catalogue/products/${p.id}`); await load(); }
    catch { setError("Delete failed"); }
  };

  const handleSaveCategory = async () => {
    setSaving(true); setError(null);
    try {
      await api.post("/catalogue/categories", { name: catForm.name.trim(), description: catForm.description.trim() || null });
      setSuccess("Category added!");
      setCatModal(false); setCatForm({ name: "", description: "" });
      await load();
    } catch { setError("Category save failed"); }
    finally { setSaving(false); }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`"${name}" category delete karo? Products uncategorized ho jayenge.`)) return;
    try { await api.delete(`/catalogue/categories/${id}`); await load(); }
    catch { setError("Delete failed"); }
  };

  const stats = [
    { label: "Total Products", value: products.length, icon: Package },
    { label: "Active", value: products.filter((p) => p.is_active).length, icon: Tag },
    { label: "Categories", value: categories.length, icon: ChevronDown },
    { label: "Out of Stock", value: products.filter((p) => p.stock !== null && p.stock === 0).length, icon: X },
  ];

  return (
    <>
      <Topbar title="Catalogue" />
      <div className="p-4 sm:p-6">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
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

        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="pl-8 w-52" />
            </div>
            <Select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="w-40">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCatModal(true)}>
              <Plus className="h-4 w-4" /> Category
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          </div>
        </div>

        {/* Categories strip */}
        {categories.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCat("")}
              className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", !filterCat ? "bg-primary text-white" : "border border-border bg-white text-muted-foreground hover:border-primary hover:text-primary")}
            >
              All
            </button>
            {categories.map((c) => (
              <div key={c.id} className="group relative flex items-center gap-1">
                <button
                  onClick={() => setFilterCat(c.id === filterCat ? "" : c.id)}
                  className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", filterCat === c.id ? "bg-primary text-white" : "border border-border bg-white text-muted-foreground hover:border-primary hover:text-primary")}
                >
                  {c.name}
                </button>
                <button
                  onClick={() => handleDeleteCategory(c.id, c.name)}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Products grid */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-white p-12 text-center">
            <Package className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <p className="font-medium">No products</p>
            <p className="text-sm text-muted-foreground">Add your first product to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => (
              <div key={p.id} className={cn("group relative rounded-2xl border border-border bg-white overflow-hidden shadow-sm transition-shadow hover:shadow-md", !p.is_active && "opacity-60")}>
                {/* Image */}
                <div className="relative h-44 w-full bg-gray-100">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageOff className="h-10 w-10 text-gray-300" />
                    </div>
                  )}
                  {/* Action buttons overlay */}
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => openEdit(p)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-md hover:bg-muted">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(p)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-md hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* Stock badge */}
                  {p.stock !== null && (
                    <span className={cn("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold", p.stock === 0 ? "bg-red-100 text-red-700" : p.stock < 5 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")}>
                      {p.stock === 0 ? "Out of stock" : `${p.stock} left`}
                    </span>
                  )}
                </div>
                {/* Info */}
                <div className="p-3">
                  {p.category_name && (
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{p.category_name}</p>
                  )}
                  <p className="truncate font-semibold">{p.name}</p>
                  {p.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
                  {p.sku && <p className="mt-1 text-[10px] text-muted-foreground">SKU: {p.sku}</p>}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-base font-bold text-primary">
                      {formatPrice(p.price, p.currency)}
                    </span>
                    <Switch size="sm" checked={p.is_active} onCheckedChange={() => handleToggle(p)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product Modal */}
      <Dialog open={productModal !== null} onClose={() => setProductModal(null)}>
        <DialogHeader>
          <DialogTitle>{productModal === "add" ? "Add Product" : "Edit Product"}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-1.5">
            <Label>Product Name *</Label>
            <Input value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Premium T-Shirt" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <textarea
              value={productForm.description}
              onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Short description..."
              className="flex w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Price (paise) *</Label>
              <Input type="number" min={0} value={productForm.price} onChange={(e) => setProductForm((f) => ({ ...f, price: Number(e.target.value) }))} placeholder="99900 = ₹999" />
              <p className="text-[10px] text-muted-foreground">Preview: {formatPrice(Number(productForm.price) || 0, productForm.currency)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={productForm.currency} onChange={(e) => setProductForm((f) => ({ ...f, currency: e.target.value }))}>
                <option value="INR">INR ₹</option>
                <option value="USD">USD $</option>
                <option value="AED">AED د.إ</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>SKU (optional)</Label>
              <Input value={productForm.sku} onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))} placeholder="PROD-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Stock (khali = unlimited)</Label>
              <Input type="number" min={0} value={productForm.stock} onChange={(e) => setProductForm((f) => ({ ...f, stock: e.target.value }))} placeholder="100" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Image URL (optional)</Label>
            <Input value={productForm.image_url} onChange={(e) => setProductForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={productForm.category_id} onChange={(e) => setProductForm((f) => ({ ...f, category_id: e.target.value }))}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={productForm.is_active} onCheckedChange={(v) => setProductForm((f) => ({ ...f, is_active: v }))} />
            <Label>Active (visible)</Label>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setProductModal(null)}>Cancel</Button>
          <Button onClick={handleSaveProduct} disabled={saving || !productForm.name}>
            {saving ? "Saving..." : productModal === "add" ? "Add Product" : "Save Changes"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Category Modal */}
      <Dialog open={catModal} onClose={() => setCatModal(false)}>
        <DialogHeader><DialogTitle>New Category</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-1.5">
            <Label>Category Name *</Label>
            <Input value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. T-Shirts" onKeyDown={(e) => e.key === "Enter" && handleSaveCategory()} />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input value={catForm.description} onChange={(e) => setCatForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional" />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCatModal(false)}>Cancel</Button>
          <Button onClick={handleSaveCategory} disabled={saving || !catForm.name}>{saving ? "Saving..." : "Add Category"}</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}