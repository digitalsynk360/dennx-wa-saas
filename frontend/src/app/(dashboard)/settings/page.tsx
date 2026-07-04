"use client";
import { useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { ProfileTab } from "@/components/settings/profile-tab";
import { WorkspaceTab } from "@/components/settings/workspace-tab";
import { WhatsAppSettingsTab } from "@/components/settings/whatsapp-settings-tab";
import { NotificationsTab } from "@/components/settings/notifications-tab";
import { ApiKeysTab } from "@/components/settings/api-keys-tab";
import { KnowledgeBaseTab } from "@/components/settings/knowledge-base-tab";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "workspace", label: "Workspace" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "notifications", label: "Notifications" },
  { id: "api-keys", label: "API Keys" },
  { id: "knowledge-base", label: "AI Knowledge Base" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile");

  return (
    <>
      <Topbar title="Settings" />
      <div className="p-4 sm:p-6">
        {/* Scrollable tab bar — mobile pe overflow nahi hota */}
        <div className="mb-6 flex overflow-x-auto border-b border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "workspace" && <WorkspaceTab />}
        {activeTab === "whatsapp" && <WhatsAppSettingsTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "api-keys" && <ApiKeysTab />}
        {activeTab === "knowledge-base" && <KnowledgeBaseTab />}
      </div>
    </>
  );
}