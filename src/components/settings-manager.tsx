"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type UserSettings = {
  email: string;
};

type SettingsManagerProps = {
  initialUser: UserSettings;
};

export function SettingsManager({ initialUser }: SettingsManagerProps) {
  const [settings, setSettings] = useState<UserSettings | null>(initialUser);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSettings() {
    const response = await fetch("/api/settings");
    const data = (await response.json()) as { user: UserSettings };
    setSettings(data.user);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Unable to save settings.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setMessage("Settings saved.");
    await loadSettings();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">Email</p>
            <p className="font-medium">{settings?.email ?? "..."}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="currentPassword">
              Current password (only needed to change password)
            </label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="newPassword">
              New password
            </label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-green-600">{message}</p> : null}

          <Button type="submit">Save</Button>
        </form>
      </CardContent>
    </Card>
  );
}
