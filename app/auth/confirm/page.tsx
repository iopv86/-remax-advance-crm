"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AuthConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = createClient();

    // PKCE flow: token arrives as query params
    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type") as
      | "invite"
      | "recovery"
      | "signup"
      | "email"
      | null;
    const next = searchParams.get("next") ?? "/dashboard";

    // Implicit flow: token arrives in the hash fragment (#access_token=...)
    // Hash is browser-only — a server route handler never sees it.
    const hash =
      typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const hashType = hashParams.get("type");

    async function processAuth() {
      if (token_hash && type) {
        // ── PKCE path ──────────────────────────────────────────────
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (error) {
          router.replace(
            `/login?error=${encodeURIComponent(error.message)}`
          );
          return;
        }
        if (type === "invite" || type === "recovery") {
          router.replace("/auth/set-password");
        } else {
          router.replace(next);
        }
      } else if (accessToken && refreshToken) {
        // ── Implicit / hash-fragment path ──────────────────────────
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          router.replace(
            `/login?error=${encodeURIComponent(error.message)}`
          );
          return;
        }
        if (hashType === "recovery" || hashType === "invite") {
          router.replace("/auth/set-password");
        } else {
          router.replace("/dashboard");
        }
      } else {
        // No token at all — bad link or already expired
        router.replace("/login?error=El+enlace+es+inv%C3%A1lido+o+ya+expir%C3%B3");
      }
    }

    void processAuth();
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
          fontFamily: "Inter, sans-serif",
          fontSize: 14,
        }}
      >
        Verificando acceso…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense>
      <AuthConfirmInner />
    </Suspense>
  );
}
