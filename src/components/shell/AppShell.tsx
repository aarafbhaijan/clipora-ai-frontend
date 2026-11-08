"use client";
import { MenuOutlined } from "@ant-design/icons";
import { Button, Drawer, Grid, Layout, Splitter, theme } from "antd";
import { useEffect, useState, useSyncExternalStore } from "react";
import HistorySidebar from "./HistorySidebar";
import { useUploads } from "@/lib/uploads";

/** Warn before closing the tab while an upload is running: closing stops it. */
function useLeaveGuard() {
  const busy = useUploads((s) => Object.values(s.items).some((u) => u.status !== "done" && u.status !== "failed"));
  useEffect(() => {
    if (!busy) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);
}

// The sidebar can be dragged between these widths; the last width is remembered per browser.
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 440;
const SIDEBAR_DEFAULT = 280;
const WIDTH_KEY = "clipora.sidebarWidth";

const noSubscribe = () => () => {};

function savedWidth(): number {
  try {
    const v = Number(window.localStorage.getItem(WIDTH_KEY));
    return v >= SIDEBAR_MIN && v <= SIDEBAR_MAX ? v : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const screens = Grid.useBreakpoint();
  const narrow = !screens.lg;
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Saved width from the browser (server render uses the default), overridden while dragging.
  const stored = useSyncExternalStore(noSubscribe, savedWidth, () => SIDEBAR_DEFAULT);
  const [dragged, setWidth] = useState<number | null>(null);
  const width = dragged ?? stored;
  const { token } = theme.useToken();
  useLeaveGuard();

  const main = (
    <Layout style={{ minWidth: 0, position: "relative", height: "100%" }}>
      <Button
        type="text"
        icon={<MenuOutlined />}
        aria-label={narrow ? "Open video list" : collapsed ? "Show video list" : "Hide video list"}
        onClick={() => (narrow ? setOpen(true) : setCollapsed((c) => !c))}
        size="small"
        style={{ position: "absolute", top: 8, left: 10, zIndex: 10 }}
      />
      <Layout.Content style={{ overflow: "auto", height: "100%" }}>{children}</Layout.Content>
    </Layout>
  );

  if (!narrow) {
    return (
      <Layout style={{ height: "100vh" }}>
        <Splitter
          onResize={([w]) => {
            if (collapsed || !w) return;
            setWidth(w);
          }}
          onResizeEnd={([w]) => {
            try {
              if (w) window.localStorage.setItem(WIDTH_KEY, String(Math.round(w)));
            } catch {
              // Private mode or blocked storage: the width just isn't remembered.
            }
          }}
        >
          <Splitter.Panel
            size={collapsed ? 0 : width}
            min={collapsed ? 0 : SIDEBAR_MIN}
            max={SIDEBAR_MAX}
            resizable={!collapsed}
            style={{ background: token.colorBgLayout, borderRight: `1px solid ${token.colorBorderSecondary}` }}
          >
            {collapsed ? null : <HistorySidebar />}
          </Splitter.Panel>
          <Splitter.Panel>{main}</Splitter.Panel>
        </Splitter>
      </Layout>
    );
  }

  // Narrow screens: the list is a drawer.
  return (
    <Layout style={{ height: "100vh" }}>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        placement="left"
        size={300}
        styles={{ body: { padding: 0 } }}
        title={null}
        closable={false}
      >
        <HistorySidebar onNavigate={() => setOpen(false)} />
      </Drawer>
      {main}
    </Layout>
  );
}
