import { AntdRegistry } from "@ant-design/nextjs-registry";
import type { Metadata } from "next";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Clipora AI",
  description: "Turn long videos into short clips by chatting with an editor that plans before it renders.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
