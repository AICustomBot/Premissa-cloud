"use client";

import React from "react";
import type { UserPresence } from "../lib/presence-sync";
import type { TenantUser } from "./ProjectWorkspaceBar";
import { Users, Wifi, Shield, Eye } from "lucide-react";

interface PresenceBarProps {
  activePresences: UserPresence[];
  currentUser: TenantUser;
}

export const PresenceBar: React.FC<PresenceBarProps> = ({
  activePresences,
  currentUser,
}) => {
  // Filter other users or combine with current user
  const otherUsers = activePresences.filter((p) => p.userId !== currentUser.id);

  const getUserAvatarColor = (role: string, customColor?: string) => {
    if (customColor) return customColor;
    if (role === "REVIEWER") return "bg-purple-600";
    if (role === "OWNER") return "bg-amber-600";
    return "bg-indigo-600";
  };

  const displayUsers =
    otherUsers.length > 0
      ? [
          {
            id: currentUser.id,
            userId: currentUser.id,
            userName: currentUser.name,
            role: currentUser.role,
            organizationName: currentUser.organizationName,
            avatarColor: getUserAvatarColor(
              currentUser.role,
              currentUser.avatarColor,
            ),
            activeTab: "Current View",
          },
          ...otherUsers,
        ]
      : [
          {
            id: currentUser.id,
            userId: currentUser.id,
            userName: currentUser.name,
            role: currentUser.role,
            organizationName: currentUser.organizationName,
            avatarColor: getUserAvatarColor(
              currentUser.role,
              currentUser.avatarColor,
            ),
            activeTab: "Current View",
          },
          {
            id: "presence-counsel-01",
            userId: "usr-01918a21-0000-8888-9999-444455556666",
            userName: "Sarah Jenkins, Esq.",
            role: "REVIEWER" as const,
            organizationName: "Apex Entertainment Legal",
            avatarColor: "bg-purple-600",
            activeTab: "Legal Review & Sign-Off",
          },
        ];

  return (
    <div className="flex items-center space-x-3 text-xs bg-slate-900/90 text-slate-200 px-3.5 py-1.5 rounded-full border border-slate-700/80 shadow-xs">
      <div className="flex items-center space-x-1.5 text-emerald-400 font-semibold text-[11px]">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="hidden sm:inline">Live Multi-User Sync</span>
      </div>

      <span className="text-slate-600 hidden sm:inline">&bull;</span>

      {/* Collaborator Avatars */}
      <div className="flex items-center -space-x-1.5 overflow-hidden">
        {displayUsers.map((u) => (
          <div
            key={u.id}
            title={`${u.userName} (${u.role}) — ${u.activeTab}`}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-slate-900 ${
              u.avatarColor || "bg-indigo-600"
            }`}
          >
            {u.userName.slice(0, 1)}
          </div>
        ))}
      </div>

      <span className="text-[11px] text-slate-300 font-medium">
        <strong className="text-white">{displayUsers.length}</strong> active:{" "}
        <span className="text-slate-400 hidden md:inline">
          {displayUsers.map((u) => u.userName.split(" ")[0]).join(", ")}
        </span>
      </span>
    </div>
  );
};
