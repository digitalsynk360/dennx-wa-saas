"use client";
import { useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { WhatsAppSettingsTab } from "@/components/settings/whatsapp-settings-tab";
import { NotificationsTab } from "@/components/settings/notifications-tab";
import { ApiKeysTab } from "@/components/settings/api-keys-tab";
import { KnowledgeBaseTab } from "@/components/settings/knowledge-base-tab";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "notifications", label: "Notifications" },
  { id: "api-keys", label: "API Keys" },
  { id: "knowledge-base", label: "AI Knowledge Base" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("whatsapp");

  return (
    <>
      <Topbar title="Settings" />
      <div className="p-6">
        <div className="mb-6 flex border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "whatsapp" && <WhatsAppSettingsTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "api-keys" && <ApiKeysTab />}
        {activeTab === "knowledge-base" && <KnowledgeBaseTab />}
      </div>
    </>
  );
}
