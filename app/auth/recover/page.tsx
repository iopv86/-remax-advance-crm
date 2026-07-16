"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function RecoverInner() {
  const router = useRouter();

  useEffect(() => {
    const hash =
      typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const hashType = hashParams.get("type");

    async function processHash() {
      if (!accessToken || !refreshToken) {
        router.replace("/login?error=El+enlace+es+inv%C3%A1lido+o+ya+expir%C3%B3");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        router.replace(`/login?error=${encodeURIComponent(error.message)}`);
        return;
      }

      if (hashType === "recovery" || hashType === "invite") {
        router.replace("/auth/set-password");
      } else {
        router.replace("/dashboard");
      }
    }

    void processHash();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#131313",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: "3px solid #C9963A",
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p
        style={{
          color: "#9899A8",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
        }}
      >
        Verificando acceso…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}

export default function RecoverPage() {
  return (
    <Suspense>
      <RecoverInner />
    </Suspense>
  );
}
