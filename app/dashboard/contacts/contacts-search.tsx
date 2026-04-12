"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useCallback } from "react";

export function ContactsSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createQueryString = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      return params.toString();
    },
    [searchParams]
  );

  const hasFilters = searchParams.get("q") || searchParams.get("classification") || searchParams.get("status");

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Buscar por nombre, teléfono o email..."
          defaultValue={searchParams.get("q") ?? ""}
          onChange={(e) => {
            const qs = createQueryString({ q: e.target.value || undefined });
            router.push(`${pathname}?${qs}`);
          }}
          className="pl-9"
        />
      </div>

      <Select
        value={searchParams.get("classification") || "all"}
        onValueChange={(val) => {
          const qs = createQueryString({ classification: val === "all" ? undefined : val });
          router.push(`${pathname}?${qs}`);
        }}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Clasificación" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          <SelectItem value="hot">🔥 HOT</SelectItem>
          <SelectItem value="warm">🟠 WARM</SelectItem>
          <SelectItem value="cold">❄️ COLD</SelectItem>
          <SelectItem value="unqualified">UNQUALIFIED</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("status") || "all"}
        onValueChange={(val) => {
          const qs = createQueryString({ status: val === "all" ? undefined : val });
          router.push(`${pathname}?${qs}`);
        }}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="new">Nuevo</SelectItem>
          <SelectItem value="contacted">Contactado</SelectItem>
          <SelectItem value="qualified">Calificado</SelectItem>
          <SelectItem value="nurturing">Nutriendo</SelectItem>
          <SelectItem value="unqualified">No calificado</SelectItem>
          <SelectItem value="archived">Archivado</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4 mr-1" /> Limpiar
        </Button>
      )}
    </div>
  );
}
