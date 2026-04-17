"use client";

import { SettingsAccessGate } from "@/components/settings/SettingsAccessGate";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsAccessGate>{children}</SettingsAccessGate>;
}
