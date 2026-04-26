"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Bank = {
  id: string;
  name: string;
  color: string | null;
};

type BanksManagerProps = {
  initialBanks: Bank[];
};

export function BanksManager({ initialBanks }: BanksManagerProps) {
  const [banks, setBanks] = useState<Bank[]>(initialBanks);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadBanks() {
    const response = await fetch("/api/banks");
    const data = (await response.json()) as { banks: Bank[] };
    setBanks(data.banks ?? []);
  }

  async function createBank(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Unable to create bank.");
      return;
    }

    setName("");
    setColor("");
    await loadBanks();
  }

  async function editBank(bank: Bank) {
    const newName = window.prompt("Bank name", bank.name);
    if (!newName) return;
    const newColor = window.prompt("Hex color (optional)", bank.color ?? "") ?? "";

    const response = await fetch(`/api/banks/${bank.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, color: newColor }),
    });

    if (response.ok) {
      await loadBanks();
    }
  }

  async function removeBank(bankId: string) {
    const confirmed = window.confirm("Delete this bank?");
    if (!confirmed) return;

    const response = await fetch(`/api/banks/${bankId}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Unable to delete bank.");
      return;
    }
    await loadBanks();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add bank</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={createBank}>
            <Input
              placeholder="Bank name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Input
              placeholder="#AABBCC (optional)"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
            <Button type="submit">Create bank</Button>
          </form>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your banks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {banks.length === 0 ? (
            <p className="text-muted-foreground text-sm">No banks yet.</p>
          ) : (
            banks.map((bank) => (
              <div
                key={bank.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-2">
                  {bank.color ? (
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: bank.color }}
                    />
                  ) : null}
                  <span>{bank.name}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => editBank(bank)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => removeBank(bank.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
