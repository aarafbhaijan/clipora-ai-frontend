"use client";
import { XProvider } from "@ant-design/x";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "antd";
import { useState } from "react";
import { ApiError } from "@/api/client";
import AuthGate from "@/components/common/AuthGate";
import { appTheme } from "@/theme";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Keep the last data when polling fails; components show a small notice instead.
            retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <XProvider theme={appTheme}>
      <App>
        <QueryClientProvider client={client}>
          <AuthGate>{children}</AuthGate>
        </QueryClientProvider>
      </App>
    </XProvider>
  );
}
