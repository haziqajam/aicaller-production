"use client";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/components/theme-provider";
import { makeQueryClient } from "@/lib/query";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(makeQueryClient);
  return (
    <ThemeProvider>
      <NuqsAdapter>
        <QueryClientProvider client={qc}>
          {children}
          <Toaster position="top-right" richColors />
        </QueryClientProvider>
      </NuqsAdapter>
    </ThemeProvider>
  );
}
