"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactFlow, {
  Background, BackgroundVariant, BaseEdge, Connection, Controls,
  Edge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath,
  Handle, MarkerType, MiniMap, Node, NodeProps, NodeToolbar,
  Position, ReactFlowProvider, addEdge,
  useEdgesState, useNodesState, useReactFlow,
} from "reactflow";
import {
  ArrowLeft, Bot, Calendar, CheckCircle, ChevronDown, ChevronRight,
  Clock, Copy, CreditCard, Database, Eye, FileText, Flag,
  GitBranch, Globe, Hash, LayoutGrid, List, MessageCircle,
  MessageSquare, Phone, RotateCcw, RotateCw, Save, Search,
  Send, Settings, Tag, Trash2, Users, Webhook, X, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FlowResponse } from "@/types/chatbot";

/* ─── Types ──────────────────────────────────────────────────────── */
interface FieldDef {
  key: string; label: string;
  type: "text" | "textarea" | "select" | "number";
  placeholder?: string;
  options?: { label: string; value: string }[];
  rows?: number;
}
interface NodeDef {
  type: string; label: string; subtitle: string;
  icon: React.ReactNode; color: string; bgLight: string; category: string;
  fields: FieldDef[];
  outputs?: { id: string; label: string; color: string }[];
}

/* ─── Palette ────────────────────────────────────────────────────── */
const NODE_DEFS: NodeDef[] = [
  { type:"keyword_trigger", label:"Keyword Trigger", subtitle:"Start flow on keyword match", icon:<Zap className="h-4 w-4"/>, color:"#f59e0b", bgLight:"#fffbeb", category:"Triggers",
    fields:[{key:"keywords_raw",label:"TRIGGER KEYWORD",type:"text",placeholder:"Set keyword..."},{key:"match_type",label:"MATCH TYPE",type:"select",options:[{label:"contains",value:"contains"},{label:"exact",value:"exact"},{label:"starts with",value:"starts_with"}]}]},
  { type:"new_message_trigger", label:"New Message", subtitle:"Trigger on any new message", icon:<MessageCircle className="h-4 w-4"/>, color:"#f59e0b", bgLight:"#fffbeb", category:"Triggers",
    fields:[{key:"channel",label:"CHANNEL",type:"select",options:[{label:"WhatsApp",value:"whatsapp"}]}]},
  { type:"webhook_trigger", label:"Webhook Trigger", subtitle:"Start flow from webhook", icon:<Webhook className="h-4 w-4"/>, color:"#f59e0b", bgLight:"#fffbeb", category:"Triggers",
    fields:[{key:"secret_key",label:"WEBHOOK PATH",type:"text",placeholder:"/webhook"}]},
  { type:"schedule_trigger", label:"Schedule Trigger", subtitle:"Run flow on a schedule", icon:<Calendar className="h-4 w-4"/>, color:"#f59e0b", bgLight:"#fffbeb", category:"Triggers",
    fields:[{key:"date",label:"DATE",type:"text",placeholder:"DD/MM/YYYY"},{key:"time",label:"TIME",type:"text",placeholder:"HH:MM"},{key:"frequency",label:"FREQUENCY",type:"select",options:[{label:"Once",value:"once"},{label:"Daily",value:"daily"},{label:"Weekly",value:"weekly"}]}]},
  { type:"send_text", label:"Send Text", subtitle:"Send a text message", icon:<MessageSquare className="h-4 w-4"/>, color:"#3b82f6", bgLight:"#eff6ff", category:"Messages",
    fields:[{key:"message",label:"MESSAGE",type:"textarea",placeholder:"Type your message here...",rows:4},{key:"footer",label:"FOOTER (optional)",type:"text",placeholder:"Reply STOP to unsubscribe"}]},
  { type:"send_image", label:"Send Image", subtitle:"Send an image with caption", icon:<FileText className="h-4 w-4"/>, color:"#3b82f6", bgLight:"#eff6ff", category:"Messages",
    fields:[{key:"image_url",label:"IMAGE URL",type:"text",placeholder:"https://..."},{key:"caption",label:"CAPTION",type:"text",placeholder:"Optional caption"}]},
  { type:"send_video", label:"Send Video", subtitle:"Send a video with caption", icon:<FileText className="h-4 w-4"/>, color:"#3b82f6", bgLight:"#eff6ff", category:"Messages",
    fields:[{key:"video_url",label:"VIDEO URL",type:"text",placeholder:"https://..."},{key:"caption",label:"CAPTION",type:"text",placeholder:"Optional"}]},
  { type:"send_audio", label:"Send Audio", subtitle:"Send an audio message", icon:<FileText className="h-4 w-4"/>, color:"#3b82f6", bgLight:"#eff6ff", category:"Messages",
    fields:[{key:"audio_url",label:"AUDIO URL",type:"text",placeholder:"https://..."}]},
  { type:"send_document", label:"Send Document", subtitle:"Send a file or document", icon:<FileText className="h-4 w-4"/>, color:"#3b82f6", bgLight:"#eff6ff", category:"Messages",
    fields:[{key:"file_url",label:"FILE URL",type:"text",placeholder:"https://..."},{key:"file_name",label:"FILE NAME",type:"text",placeholder:"document.pdf"}]},
  { type:"send_buttons", label:"Send Buttons", subtitle:"Send message with reply buttons", icon:<List className="h-4 w-4"/>, color:"#8b5cf6", bgLight:"#f5f3ff", category:"Messages",
    fields:[{key:"message",label:"MESSAGE",type:"textarea",placeholder:"Choose an option:",rows:2},{key:"button_1",label:"BUTTON 1",type:"text",placeholder:"Option A"},{key:"button_2",label:"BUTTON 2",type:"text",placeholder:"Option B"},{key:"button_3",label:"BUTTON 3",type:"text",placeholder:"Option C"}],
    outputs:[{id:"button_1",label:"Button 1",color:"#8b5cf6"},{id:"button_2",label:"Button 2",color:"#8b5cf6"},{id:"button_3",label:"Button 3",color:"#8b5cf6"}]},
  { type:"send_list", label:"Send List", subtitle:"Send a list menu", icon:<List className="h-4 w-4"/>, color:"#6366f1", bgLight:"#eef2ff", category:"Messages",
    fields:[{key:"title",label:"TITLE",type:"text",placeholder:"Choose from the list"},{key:"description",label:"DESCRIPTION",type:"text",placeholder:"Optional"}]},
  { type:"send_template", label:"Send Template", subtitle:"Send a WhatsApp template", icon:<FileText className="h-4 w-4"/>, color:"#7c3aed", bgLight:"#f5f3ff", category:"Messages",
    fields:[{key:"template_name",label:"TEMPLATE NAME",type:"text",placeholder:"order_confirmed"}]},
  { type:"ask_question", label:"Ask Question", subtitle:"Ask user a question", icon:<MessageCircle className="h-4 w-4"/>, color:"#14b8a6", bgLight:"#f0fdfa", category:"User Input",
    fields:[{key:"question",label:"QUESTION",type:"textarea",placeholder:"What is your name?",rows:2},{key:"variable_name",label:"SAVE ANSWER AS",type:"text",placeholder:"user_answer"}]},
  { type:"ask_name", label:"Ask Name", subtitle:"Collect user's name", icon:<Users className="h-4 w-4"/>, color:"#14b8a6", bgLight:"#f0fdfa", category:"User Input",
    fields:[{key:"variable_name",label:"SAVE AS",type:"text",placeholder:"contact_name"}]},
  { type:"ask_phone", label:"Ask Phone", subtitle:"Collect phone number", icon:<Phone className="h-4 w-4"/>, color:"#14b8a6", bgLight:"#f0fdfa", category:"User Input",
    fields:[{key:"variable_name",label:"SAVE AS",type:"text",placeholder:"phone_number"}]},
  { type:"ask_email", label:"Ask Email", subtitle:"Collect email address", icon:<Globe className="h-4 w-4"/>, color:"#14b8a6", bgLight:"#f0fdfa", category:"User Input",
    fields:[{key:"variable_name",label:"SAVE AS",type:"text",placeholder:"email"}]},
  { type:"ask_number", label:"Ask Number", subtitle:"Collect a number", icon:<Hash className="h-4 w-4"/>, color:"#14b8a6", bgLight:"#f0fdfa", category:"User Input",
    fields:[{key:"variable_name",label:"SAVE AS",type:"text",placeholder:"quantity"},{key:"min",label:"MIN",type:"number"},{key:"max",label:"MAX",type:"number"}]},
  { type:"ask_date", label:"Ask Date", subtitle:"Collect a date", icon:<Calendar className="h-4 w-4"/>, color:"#14b8a6", bgLight:"#f0fdfa", category:"User Input",
    fields:[{key:"variable_name",label:"SAVE AS",type:"text",placeholder:"booking_date"},{key:"format",label:"FORMAT",type:"text",placeholder:"DD/MM/YYYY"}]},
  { type:"ask_file", label:"Ask File", subtitle:"Request file upload", icon:<FileText className="h-4 w-4"/>, color:"#14b8a6", bgLight:"#f0fdfa", category:"User Input",
    fields:[{key:"variable_name",label:"SAVE AS",type:"text",placeholder:"file"},{key:"allowed_types",label:"ALLOWED TYPES",type:"text",placeholder:"pdf, jpg, png"}]},
  { type:"if_else", label:"If / Else", subtitle:"Branch based on condition", icon:<GitBranch className="h-4 w-4"/>, color:"#f59e0b", bgLight:"#fffbeb", category:"Logic",
    fields:[{key:"variable",label:"VARIABLE",type:"text",placeholder:"user_answer"},{key:"operator",label:"OPERATOR",type:"select",options:[{label:"equals",value:"equals"},{label:"not equals",value:"not_equals"},{label:"contains",value:"contains"},{label:"starts with",value:"starts_with"},{label:"greater than",value:"greater_than"},{label:"less than",value:"less_than"}]},{key:"value",label:"VALUE",type:"text",placeholder:"yes"}],
    outputs:[{id:"true",label:"True ✓",color:"#22c55e"},{id:"false",label:"False ✗",color:"#ef4444"}]},
  { type:"switch", label:"Switch", subtitle:"Multiple condition branches", icon:<GitBranch className="h-4 w-4"/>, color:"#f59e0b", bgLight:"#fffbeb", category:"Logic",
    fields:[{key:"variable",label:"VARIABLE",type:"text",placeholder:"user_choice"}]},
  { type:"delay", label:"Delay", subtitle:"Wait before next step", icon:<Clock className="h-4 w-4"/>, color:"#6b7280", bgLight:"#f9fafb", category:"Logic",
    fields:[{key:"seconds",label:"SECONDS",type:"number"},{key:"minutes",label:"MINUTES",type:"number"},{key:"hours",label:"HOURS",type:"number"}]},
  { type:"wait_for_reply", label:"Wait For Reply", subtitle:"Pause until user replies", icon:<MessageCircle className="h-4 w-4"/>, color:"#6b7280", bgLight:"#f9fafb", category:"Logic",
    fields:[{key:"timeout",label:"TIMEOUT (seconds)",type:"number",placeholder:"3600"}]},
  { type:"go_to_flow", label:"Go To Flow", subtitle:"Jump to another flow", icon:<ArrowLeft className="h-4 w-4"/>, color:"#6b7280", bgLight:"#f9fafb", category:"Logic",
    fields:[{key:"target_flow",label:"TARGET FLOW ID",type:"text",placeholder:"Flow ID"}]},
  { type:"save_variable", label:"Save Variable", subtitle:"Store a value", icon:<Save className="h-4 w-4"/>, color:"#0891b2", bgLight:"#ecfeff", category:"Variables",
    fields:[{key:"variable_name",label:"VARIABLE NAME",type:"text",placeholder:"my_variable"},{key:"value",label:"VALUE",type:"text",placeholder:"{{interpolated}}"}]},
  { type:"update_variable", label:"Update Variable", subtitle:"Update existing variable", icon:<Settings className="h-4 w-4"/>, color:"#0891b2", bgLight:"#ecfeff", category:"Variables",
    fields:[{key:"variable_name",label:"VARIABLE NAME",type:"text",placeholder:"my_variable"},{key:"new_value",label:"NEW VALUE",type:"text",placeholder:"new value"}]},
  { type:"delete_variable", label:"Delete Variable", subtitle:"Remove a variable", icon:<X className="h-4 w-4"/>, color:"#0891b2", bgLight:"#ecfeff", category:"Variables",
    fields:[{key:"variable_name",label:"VARIABLE NAME",type:"text",placeholder:"my_variable"}]},
  { type:"create_contact", label:"Create Contact", subtitle:"Add new contact", icon:<Users className="h-4 w-4"/>, color:"#16a34a", bgLight:"#f0fdf4", category:"Contacts",
    fields:[{key:"name",label:"NAME",type:"text",placeholder:"{{full_name}}"},{key:"phone",label:"PHONE",type:"text",placeholder:"{{phone}}"},{key:"email",label:"EMAIL",type:"text",placeholder:"{{email}}"}]},
  { type:"update_contact", label:"Update Contact", subtitle:"Update contact details", icon:<Users className="h-4 w-4"/>, color:"#16a34a", bgLight:"#f0fdf4", category:"Contacts",
    fields:[{key:"name",label:"NAME",type:"text",placeholder:"{{full_name}}"}]},
  { type:"add_tag", label:"Add Tag", subtitle:"Tag a contact", icon:<Tag className="h-4 w-4"/>, color:"#16a34a", bgLight:"#f0fdf4", category:"Contacts",
    fields:[{key:"tag_name",label:"TAG NAME",type:"text",placeholder:"VIP Customer"}]},
  { type:"remove_tag", label:"Remove Tag", subtitle:"Remove contact tag", icon:<Tag className="h-4 w-4"/>, color:"#16a34a", bgLight:"#f0fdf4", category:"Contacts",
    fields:[{key:"tag_name",label:"TAG NAME",type:"text",placeholder:"VIP Customer"}]},
  { type:"assign_agent", label:"Assign Agent", subtitle:"Assign to a team member", icon:<Users className="h-4 w-4"/>, color:"#e11d48", bgLight:"#fff1f2", category:"Team",
    fields:[{key:"strategy",label:"STRATEGY",type:"select",options:[{label:"Round Robin",value:"round_robin"},{label:"Least Busy",value:"least_busy"},{label:"Specific Agent",value:"specific"}]},{key:"agent_id",label:"AGENT ID",type:"text",placeholder:"Agent user ID"}]},
  { type:"transfer_chat", label:"Transfer Chat", subtitle:"Transfer to team or agent", icon:<Send className="h-4 w-4"/>, color:"#e11d48", bgLight:"#fff1f2", category:"Team",
    fields:[{key:"team",label:"TEAM",type:"text",placeholder:"Support Team"},{key:"agent",label:"AGENT (optional)",type:"text",placeholder:"Leave blank for any"}]},
  { type:"create_ticket", label:"Create Ticket", subtitle:"Open a support ticket", icon:<Settings className="h-4 w-4"/>, color:"#e11d48", bgLight:"#fff1f2", category:"Team",
    fields:[{key:"subject",label:"SUBJECT",type:"text",placeholder:"{{issue}}"},{key:"priority",label:"PRIORITY",type:"select",options:[{label:"Low",value:"low"},{label:"Normal",value:"normal"},{label:"High",value:"high"},{label:"Critical",value:"critical"}]}]},
  { type:"api_request", label:"API Request", subtitle:"Call an external API", icon:<Globe className="h-4 w-4"/>, color:"#0284c7", bgLight:"#f0f9ff", category:"Integrations",
    fields:[{key:"method",label:"METHOD",type:"select",options:[{label:"GET",value:"GET"},{label:"POST",value:"POST"},{label:"PUT",value:"PUT"},{label:"DELETE",value:"DELETE"}]},{key:"url",label:"URL",type:"text",placeholder:"https://api.example.com/data"},{key:"body",label:"BODY (JSON)",type:"textarea",placeholder:'{"key":"{{value}}"}',rows:3},{key:"save_response_variable",label:"SAVE RESPONSE AS",type:"text",placeholder:"_api_response"}],
    outputs:[{id:"success",label:"Success",color:"#22c55e"},{id:"error",label:"Error",color:"#ef4444"}]},
  { type:"find_record", label:"Find Record", subtitle:"Search database records", icon:<Database className="h-4 w-4"/>, color:"#475569", bgLight:"#f8fafc", category:"Database",
    fields:[{key:"table",label:"TABLE",type:"text",placeholder:"contacts"},{key:"conditions",label:"CONDITIONS (JSON)",type:"textarea",placeholder:'{"phone":"{{phone}}"}',rows:2}],
    outputs:[{id:"found",label:"Found",color:"#22c55e"},{id:"not_found",label:"Not Found",color:"#f59e0b"}]},
  { type:"create_record", label:"Create Record", subtitle:"Insert database record", icon:<Database className="h-4 w-4"/>, color:"#475569", bgLight:"#f8fafc", category:"Database",
    fields:[{key:"table",label:"TABLE",type:"text",placeholder:"orders"},{key:"data",label:"DATA (JSON)",type:"textarea",placeholder:'{"name":"{{name}}"}',rows:2}]},
  { type:"create_payment_link", label:"Payment Link", subtitle:"Generate a payment link", icon:<CreditCard className="h-4 w-4"/>, color:"#059669", bgLight:"#ecfdf5", category:"Payments",
    fields:[{key:"amount",label:"AMOUNT",type:"number",placeholder:"999"},{key:"currency",label:"CURRENCY",type:"text",placeholder:"INR"},{key:"description",label:"DESCRIPTION",type:"text",placeholder:"Order payment"}],
    outputs:[{id:"paid",label:"Paid",color:"#22c55e"},{id:"failed",label:"Failed",color:"#ef4444"}]},
  { type:"end_flow", label:"End Flow", subtitle:"Complete the flow", icon:<Flag className="h-4 w-4"/>, color:"#dc2626", bgLight:"#fef2f2", category:"Flow Control",
    fields:[{key:"completion_message",label:"COMPLETION MESSAGE",type:"textarea",placeholder:"Thank you! Have a great day.",rows:2}]},
  { type:"stop_flow", label:"Stop Flow", subtitle:"Stop flow immediately", icon:<X className="h-4 w-4"/>, color:"#dc2626", bgLight:"#fef2f2", category:"Flow Control",
    fields:[{key:"reason",label:"REASON",type:"text",placeholder:"User requested stop"}]},
];

const NODE_MAP = Object.fromEntries(NODE_DEFS.map(d => [d.type, d]));
const CATEGORIES = [...new Set(NODE_DEFS.map(d => d.category))];

function getSummary(type: string, data: Record<string, any>): string {
  const d = data || {};
  switch(type) {
    case "keyword_trigger": return d.keywords_raw || "Set keyword...";
    case "webhook_trigger": return d.secret_key || "/webhook";
    case "send_text": return d.message || "Type your message here...";
    case "ask_question": return d.question || "Set your question...";
    case "send_buttons": return d.message || "Choose an option:";
    case "if_else": return d.variable ? `${d.variable} ${d.operator||"equals"} "${d.value||""}"` : "Set condition...";
    case "delay": return [d.seconds&&`${d.seconds}s`, d.minutes&&`${d.minutes}m`, d.hours&&`${d.hours}h`].filter(Boolean).join(" ") || "Set delay...";
    case "api_request": return d.url || "Set API URL...";
    case "save_variable": return d.variable_name ? `${d.variable_name} = ${d.value||"?"}` : "Set variable...";
    default: {
      const def = NODE_MAP[type];
      if (def?.fields[0]) return (d[def.fields[0].key] as string) || def.fields[0].placeholder || "Configure...";
      return "Configure...";
    }
  }
}

/* ─── Custom deletable edge ──────────────────────────────────────── */
function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, label }: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all", position: "absolute" }}
          className="nodrag nopan group">
          {label && (
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white border border-gray-200 text-[10px] font-bold px-2 py-0.5 text-gray-500 shadow-sm">
              {label as string}
            </span>
          )}
          <button
            onClick={() => setEdges(eds => eds.filter(e => e.id !== id))}
            className="flex items-center justify-center w-5 h-5 rounded-full bg-white border-2 border-gray-300 text-gray-400 hover:bg-red-500 hover:border-red-500 hover:text-white transition-all shadow-sm opacity-0 group-hover:opacity-100">
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { deletable: DeletableEdge };

/* ─── Node popup ─────────────────────────────────────────────────── */
function NodePopup({ def, data, onSave, onClose }: {
  def: NodeDef; data: Record<string, any>;
  onSave: (d: Record<string, any>) => void; onClose: () => void;
}) {
  const [local, setLocal] = useState<Record<string, any>>({ ...data });
  const set = (k: string, v: any) => setLocal(p => ({ ...p, [k]: v }));
  const handleSave = () => { onSave(local); onClose(); };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) { onSave(local); onClose(); } }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-80 max-h-[85vh] flex flex-col"
        onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b rounded-t-2xl flex-shrink-0"
          style={{ backgroundColor: def.bgLight }}>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl text-white" style={{ backgroundColor: def.color }}>
              {def.icon}
            </span>
            <span className="font-bold text-sm" style={{ color: def.color }}>{def.label}</span>
          </div>
          <button onClick={() => { onSave(local); onClose(); }}
            className="p-1.5 rounded-xl hover:bg-black/10 text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {def.fields.map(f => (
            <div key={f.key}>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{f.label}</label>
              {f.type === "select" ? (
                <select value={(local[f.key] as string) || ""}
                  onChange={e => set(f.key, e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                  {!local[f.key] && <option value="">Select...</option>}
                  {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea rows={f.rows || 3} value={(local[f.key] as string) || ""} placeholder={f.placeholder}
                  onChange={e => set(f.key, e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
              ) : (
                <input type={f.type} value={(local[f.key] as string) || ""} placeholder={f.placeholder}
                  onChange={e => set(f.key, e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
              )}
            </div>
          ))}
        </div>
        <div className="px-4 pb-4 pt-2 flex-shrink-0 border-t border-gray-100">
          <button onClick={handleSave}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: def.color }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Global popup state ─────────────────────────────────────────── */
let globalSetPopup: ((id: string | null) => void) | null = null;

/* ─── Flow Node ──────────────────────────────────────────────────── */
function FlowNode({ id, data, type, selected }: NodeProps) {
  const def = NODE_MAP[type || "send_text"];
  const { setNodes, setEdges } = useReactFlow();

  // ✅ ALL hooks BEFORE any early return
  const openPopup = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    globalSetPopup?.(id);
  }, [id]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes(n => n.filter(x => x.id !== id));
    setEdges(e => e.filter(x => x.source !== id && x.target !== id));
  }, [id, setNodes, setEdges]);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes(nds => {
      const orig = nds.find(n => n.id === id);
      if (!orig) return nds;
      return [...nds, { ...orig, id: `node_${Date.now()}`, position: { x: orig.position.x + 260, y: orig.position.y + 40 }, selected: false, data: { ...orig.data } }];
    });
  }, [id, setNodes]);

  // ✅ Early return AFTER hooks
  if (!def) return null;

  const isEndNode = type === "end_flow" || type === "stop_flow";
  const hasOutputs = (def.outputs?.length || 0) > 0;
  const summary = getSummary(type || "", data as Record<string, any>);

  return (
    <div style={{ width: 220 }}
      className={cn(
        "rounded-2xl bg-white border-2 shadow-md cursor-pointer select-none transition-shadow",
        selected ? "border-blue-400 shadow-blue-200 shadow-lg" : "border-gray-200 hover:border-gray-300 hover:shadow-lg"
      )}
      onClick={openPopup}>

      <NodeToolbar isVisible={selected} position={Position.Top}
        className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl shadow-lg px-1.5 py-1">
        <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-4 bg-gray-200" />
        <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </NodeToolbar>

      <Handle type="target" position={Position.Left}
        className="!w-3.5 !h-3.5 !rounded-full !border-2 !border-white !bg-gray-300 hover:!bg-blue-400 !transition-colors"
        style={{ left: -7 }} />

      <div className="flex items-center justify-between px-3 py-2.5 rounded-t-2xl"
        style={{ backgroundColor: def.bgLight, borderBottom: `1.5px solid ${def.color}22` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: def.color }}>
            {def.icon}
          </span>
          <span className="font-bold text-sm truncate" style={{ color: def.color }}>{def.label}</span>
        </div>
        {selected && (
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
            <button onClick={handleCopy} className="p-1 rounded-lg hover:bg-black/10 text-gray-400 hover:text-blue-500">
              <Copy className="h-3 w-3" />
            </button>
            <button onClick={handleDelete} className="p-1 rounded-lg hover:bg-black/10 text-gray-400 hover:text-red-400">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5" style={{ minHeight: 48 }}>
        <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{summary}</p>
      </div>

      {hasOutputs ? (
        <div className="px-3 pb-3 space-y-1.5">
          {def.outputs!.map(out => (
            <div key={out.id} className="relative flex items-center justify-between rounded-xl px-3 py-1.5 border"
              style={{ borderColor: out.color + "40", backgroundColor: out.color + "0d" }}>
              <span className="text-xs font-bold" style={{ color: out.color }}>{out.label}</span>
              <Handle type="source" position={Position.Right} id={out.id}
                className="!w-3.5 !h-3.5 !rounded-full !border-2 !border-white"
                style={{ right: -7, position: "absolute", backgroundColor: out.color }} />
            </div>
          ))}
        </div>
      ) : !isEndNode ? (
        <Handle type="source" position={Position.Right}
          className="!w-3.5 !h-3.5 !rounded-full !border-2 !border-white !bg-blue-400 hover:!bg-blue-500 !transition-colors"
          style={{ right: -7 }} />
      ) : null}
    </div>
  );
}

const nodeTypes = Object.fromEntries(NODE_DEFS.map(d => [d.type, FlowNode]));

/* ─── Undo/Redo ──────────────────────────────────────────────────── */
function useUndoRedo() {
  const [hist, setHist] = useState<{ n: Node[]; e: Edge[] }[]>([]);
  const [fut, setFut] = useState<{ n: Node[]; e: Edge[] }[]>([]);
  const push = useCallback((n: Node[], e: Edge[]) => { setHist(h => [...h.slice(-29), { n, e }]); setFut([]); }, []);
  const undo = useCallback((n: Node[], e: Edge[]) => { if (!hist.length) return { n, e }; const p = hist[hist.length - 1]; setHist(h => h.slice(0, -1)); setFut(f => [{ n, e }, ...f]); return p; }, [hist]);
  const redo = useCallback((n: Node[], e: Edge[]) => { if (!fut.length) return { n, e }; const nx = fut[0]; setFut(f => f.slice(1)); setHist(h => [...h, { n, e }]); return nx; }, [fut]);
  return { push, undo, redo, canUndo: hist.length > 0, canRedo: fut.length > 0 };
}

/* ─── Test Panel ─────────────────────────────────────────────────── */
interface TLog { node_type: string; status: string; selected_output?: string; duration_ms?: number; error_message?: string }
interface TResult { execution: { status: string; variables: Record<string, string> }; logs: TLog[] }

function TestPanel({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const [res, setRes] = useState<TResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const run = async () => {
    setLoading(true);
    try { const { data } = await api.post<TResult>(`/flows/${flowId}/test`, { trigger_data: {}, contact_phone: phone || undefined }); setRes(data); }
    catch { } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-2xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
        <span className="font-bold text-gray-700">Test Flow</span>
        <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-200"><X className="h-4 w-4 text-gray-500" /></button>
      </div>
      <div className="p-5 border-b space-y-3">
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Test Phone (optional)</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+919876543210"
            className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
        </div>
        <button onClick={run} disabled={loading}
          className="w-full rounded-xl bg-green-500 text-white text-sm font-bold py-2.5 hover:bg-green-600 disabled:opacity-50">
          {loading ? "Running..." : "▶ Run Test"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {res ? <>
          <div className={cn("rounded-xl px-4 py-3 text-sm font-bold border", res.execution.status === "completed" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200")}>
            {res.execution.status === "completed" ? "✓ Completed" : "✗ Failed"}
          </div>
          {res.logs.map((l, i) => (
            <div key={i} className={cn("rounded-xl border p-3", l.status === "ok" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")}>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700">{l.node_type}</span>
                <div className="flex items-center gap-2">
                  {l.selected_output && <span className="rounded-full bg-blue-100 text-blue-600 text-xs px-2 py-0.5 font-bold">{l.selected_output}</span>}
                  {l.duration_ms !== undefined && <span className="text-xs text-gray-400">{l.duration_ms}ms</span>}
                </div>
              </div>
              {l.error_message && <p className="mt-1 text-xs text-red-500">{l.error_message}</p>}
            </div>
          ))}
        </> : !loading && (
          <div className="text-center py-12 text-gray-400"><p className="text-sm">Run a test to see results</p></div>
        )}
      </div>
    </div>
  );
}

/* ─── Version Panel ──────────────────────────────────────────────── */
interface VI { id: string; version_number: number; status: string; created_at: string; changelog?: string }
function VersionPanel({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const [versions, setVersions] = useState<VI[]>([]);
  useEffect(() => { api.get<VI[]>(`/flows/${flowId}/versions`).then(({ data }) => setVersions(data)).catch(() => { }); }, [flowId]);
  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white border-l shadow-2xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
        <p className="font-bold text-gray-700">Version History</p>
        <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-200"><X className="h-4 w-4 text-gray-500" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {versions.length === 0 && <p className="text-sm text-gray-400 text-center pt-8">No versions yet.</p>}
        {versions.map(v => (
          <div key={v.id} className="rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-sm text-gray-700">v{v.version_number}</span>
              <span className={cn("rounded-full px-3 py-0.5 text-xs font-bold", v.status === "published" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>{v.status}</span>
            </div>
            {v.changelog && <p className="text-xs text-gray-500 mb-1">{v.changelog}</p>}
            <p className="text-xs text-gray-400">{new Date(v.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Builder ───────────────────────────────────────────────── */
let nodeIdCounter = 100;

function FlowBuilderInner() {
  const params = useParams();
  const router = useRouter();
  const flowId = params.id as string;
  const rf = useReactFlow();

  const [flow, setFlow] = useState<FlowResponse | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(["Triggers", "Messages"]));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [popupNodeId, setPopupNodeId] = useState<string | null>(null);
  const undoRedo = useUndoRedo();
  const droppingRef = useRef(false);

  useEffect(() => {
    globalSetPopup = setPopupNodeId;
    return () => { globalSetPopup = null; };
  }, []);

  const popupNode = nodes.find(n => n.id === popupNodeId) ?? null;
  const popupDef = popupNode ? NODE_MAP[popupNode.type || ""] : null;

  const handlePopupSave = useCallback((newData: Record<string, any>) => {
    if (!popupNodeId) return;
    setNodes(nds => nds.map(n => n.id === popupNodeId ? { ...n, data: { ...n.data, ...newData } } : n));
  }, [popupNodeId, setNodes]);

  useEffect(() => {
    api.get<FlowResponse>(`/flows/${flowId}`).then(({ data }) => {
      setFlow(data);
      setNodes(data.nodes.map((n: any) => ({ id: n.id, type: n.type, position: n.position, data: n.data || {} })));
      setEdges(data.edges.map((e: any) => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle ?? undefined, label: e.label,
        type: "deletable",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
        style: { stroke: "#94a3b8", strokeWidth: 2 }
      })));
      nodeIdCounter = data.nodes.length + 100;
    }).catch(() => setStatusMsg("Failed to load flow"));
  }, [flowId, setNodes, setEdges]);

  const onConnect = useCallback((conn: Connection) => {
    const edge: Edge = {
      ...conn, id: `e_${Date.now()}`, type: "deletable",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
      style: { stroke: "#94a3b8", strokeWidth: 2 },
      label: conn.sourceHandle && conn.sourceHandle !== "default" ? conn.sourceHandle : undefined,
    } as Edge;
    setEdges(eds => { const next = addEdge(edge, eds); undoRedo.push(nodes, next); return next; });
  }, [nodes, setEdges, undoRedo]);

  const onDragStart = (e: React.DragEvent, t: string) => {
    e.dataTransfer.setData("application/reactflow", t);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (droppingRef.current) return;
    droppingRef.current = true;
    setTimeout(() => { droppingRef.current = false; }, 100);
    const t = e.dataTransfer.getData("application/reactflow");
    if (!t) return;
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newId = `node_${nodeIdCounter++}`;
    const n: Node = { id: newId, type: t, position: pos, data: {} };
    setNodes(nds => [...nds, n]);
    setTimeout(() => setPopupNodeId(newId), 50);
  }, [rf, setNodes]);

  const handleUndo = () => { const p = undoRedo.undo(nodes, edges); setNodes(p.n); setEdges(p.e); };
  const handleRedo = () => { const p = undoRedo.redo(nodes, edges); setNodes(p.n); setEdges(p.e); };

  const handleAutoLayout = async () => {
    try {
      const { data } = await api.post(`/flows/${flowId}/auto-layout`, {
        nodes: nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle })),
        direction: "LR",
      });
      setNodes((data.nodes as any[]).map((n: any) => ({ ...nodes.find(x => x.id === n.id)!, position: n.position })));
      setTimeout(() => rf.fitView({ padding: 0.2 }), 50);
    } catch { }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/flows/${flowId}/graph`, {
        nodes: nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, label: e.label ?? null })),
        viewport: rf.getViewport(),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch { setStatusMsg("Save failed"); }
    finally { setSaving(false); }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try { await handleSave(); await api.post(`/flows/${flowId}/publish`, { changelog: null }); setStatusMsg("Published live ✓"); setTimeout(() => setStatusMsg(""), 3000); }
    catch { setStatusMsg("Publish failed"); }
    finally { setPublishing(false); }
  };

  const filteredDefs = search
    ? NODE_DEFS.filter(d => d.label.toLowerCase().includes(search.toLowerCase()) || d.category.toLowerCase().includes(search.toLowerCase()))
    : NODE_DEFS;

  return (
    <div className="flex h-screen flex-col" style={{ background: "#f1f5f9" }}>
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/flows")}
            className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-gray-100 text-gray-500">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="font-bold text-gray-800">{flow?.name || "Loading..."}</span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", flow?.is_active ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-500")}>
            {flow?.is_active ? "● Live" : "Draft"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleUndo} disabled={!undoRedo.canUndo} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 disabled:opacity-30"><RotateCcw className="h-4 w-4" /></button>
          <button onClick={handleRedo} disabled={!undoRedo.canRedo} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 disabled:opacity-30"><RotateCw className="h-4 w-4" /></button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button onClick={handleAutoLayout} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"><LayoutGrid className="h-4 w-4" />Layout</button>
          <button onClick={() => setShowTest(v => !v)} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"><Eye className="h-4 w-4" />Test</button>
          <button onClick={() => setShowVersions(v => !v)} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"><Clock className="h-4 w-4" />Versions</button>
          <button onClick={handleSave} disabled={saving}
            className={cn("flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold border-2 transition-all",
              saved ? "border-green-500 bg-green-50 text-green-600" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300")}>
            <Save className="h-4 w-4" />{saving ? "Saving..." : saved ? "Saved ✓" : "Save Draft"}
          </button>
          <button onClick={handlePublish} disabled={publishing}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-md shadow-blue-200">
            <Zap className="h-4 w-4" />{publishing ? "Publishing..." : "Publish Live"}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-gray-900 text-white text-sm font-medium px-5 py-2.5 shadow-2xl pointer-events-none">
          {statusMsg}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Node Palette</p>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes..."
                className="w-full rounded-xl border border-gray-200 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50 focus:bg-white" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {search ? (
              <div className="px-3 space-y-0.5">
                {filteredDefs.map(def => <PaletteItem key={def.type} def={def} onDragStart={onDragStart} />)}
              </div>
            ) : CATEGORIES.map(cat => {
              const defs = NODE_DEFS.filter(d => d.category === cat);
              const open = openCats.has(cat);
              return (
                <div key={cat}>
                  <button onClick={() => setOpenCats(p => { const n = new Set(p); n.has(cat) ? n.delete(cat) : n.add(cat); return n; })}
                    className="flex w-full items-center justify-between px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-gray-600">
                    <span>{cat} <span className="text-gray-300 font-normal normal-case">{defs.length}</span></span>
                    {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                  {open && <div className="px-3 pb-2 space-y-0.5">{defs.map(def => <PaletteItem key={def.type} def={def} onDragStart={onDragStart} />)}</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center">
                <div className="w-20 h-20 rounded-3xl bg-white shadow-lg flex items-center justify-center mx-auto mb-4">
                  <Bot className="h-10 w-10 text-gray-300" />
                </div>
                <p className="font-bold text-gray-400">Drag nodes from the left to start</p>
                <p className="text-sm text-gray-300 mt-1">Click a node to configure · Hover edges to delete</p>
              </div>
            </div>
          )}
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            fitView fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode="Delete"
            connectionLineStyle={{ strokeWidth: 2.5, stroke: "#3b82f6", strokeDasharray: "6 3" }}
            defaultEdgeOptions={{ type: "deletable", markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" }, style: { stroke: "#94a3b8", strokeWidth: 2 } }}
          >
            <Background variant={BackgroundVariant.Dots} color="#cbd5e1" gap={24} size={1.5} />
            <Controls className="bg-white border border-gray-200 rounded-2xl shadow-md" />
            <MiniMap zoomable pannable nodeColor={n => NODE_MAP[n.type || ""]?.color || "#e2e8f0"}
              className="rounded-2xl border border-gray-200 shadow-md bg-white" />
          </ReactFlow>
        </div>
      </div>

      {popupNode && popupDef && (
        <NodePopup
          key={popupNodeId!}
          def={popupDef}
          data={popupNode.data as Record<string, any>}
          onSave={handlePopupSave}
          onClose={() => setPopupNodeId(null)}
        />
      )}

      {showTest && <TestPanel flowId={flowId} onClose={() => setShowTest(false)} />}
      {showVersions && <VersionPanel flowId={flowId} onClose={() => setShowVersions(false)} />}
    </div>
  );
}

function PaletteItem({ def, onDragStart }: { def: NodeDef; onDragStart: (e: React.DragEvent, t: string) => void }) {
  return (
    <div draggable onDragStart={e => onDragStart(e, def.type)}
      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 cursor-grab hover:bg-gray-50 active:cursor-grabbing select-none border border-transparent hover:border-gray-200 transition-all">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: def.color }}>
        {def.icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-700 leading-tight">{def.label}</p>
        <p className="text-[10px] text-gray-400 leading-tight truncate">{def.subtitle}</p>
      </div>
    </div>
  );
}

export default function FlowBuilderPage() {
  return <ReactFlowProvider><FlowBuilderInner /></ReactFlowProvider>;
}