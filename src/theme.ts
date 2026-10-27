// The one place colour values are written (design.md section 1). Dark only: antd's dark algorithm with
// soft, lifted surfaces and a calm periwinkle primary, so it reads gentle rather than pitch black.
import { theme, type ThemeConfig } from "antd";

export const appTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  cssVar: { key: "clipora" },
  hashed: false,
  token: {
    colorPrimary: "#8b93f6",
    colorInfo: "#7aa7f2",
    colorSuccess: "#6cc9a1",
    colorWarning: "#e9b864",
    colorError: "#ef8584",
    colorLink: "#9aa6ff",
    colorBgBase: "#181b23",
    colorTextBase: "#e7e9f0",
    colorBgLayout: "#14171e",
    colorBgContainer: "#1d212b",
    colorBgElevated: "#242936",
    colorBorder: "#2f3544",
    colorBorderSecondary: "#272c38",
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 6,
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 14,
    wireframe: false,
  },
  components: {
    Layout: { siderBg: "#171a22", headerBg: "#181b23", bodyBg: "#14171e", headerHeight: 56, headerPadding: "0 16px" },
    Card: { colorBgContainer: "#1d212b" },
    Splitter: { splitBarSize: 2 },
    Tabs: { horizontalMargin: "0 0 8px 0" },
    Table: { rowHoverBg: "#232836", rowSelectedBg: "#262b44", rowSelectedHoverBg: "#2b3150" },
    Tag: { defaultBg: "#232836" },
  },
};

// Colours of the video picture itself (not UI chrome): letterbox, dip-to-black/white, caption shadow.
// They match what the export renders, so they are fixed rather than themed.
export const mediaColors = {
  letterbox: "#000000",
  dipBlack: "#000000",
  dipWhite: "#ffffff",
  caption: "#ffffff",
  captionShadow: "rgba(0, 0, 0, 0.85)",
};
