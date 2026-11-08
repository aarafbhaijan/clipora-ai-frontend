// The one place colour values are written (design.md section 1). Dark only: VS Code's layout (compact type, small
// radii, flat panels, a status bar) in GitHub's dark colours: a deep blue-black "night sky" canvas, blue accent.
import { theme, type ThemeConfig } from "antd";

// GitHub dark (Primer "dark" theme) values, named by the part of the editor they are used for.
const vs = {
  editor: "#0d1117", // canvas.default: the main content area
  sideBar: "#010409", // canvas.inset: side bar, title bar, status bar, inactive tabs
  widget: "#161b22", // canvas.overlay / subtle: menus, popovers, cards, inputs
  input: "#0d1117",
  border: "#30363d",
  borderSoft: "#21262d",
  text: "#e6edf3",
  accent: "#1f6feb", // accent.emphasis: buttons, focus, selection
  link: "#4493f8",
  info: "#58a6ff",
  success: "#3fb950",
  warning: "#d29922",
  error: "#f85149",
  listHover: "#161b22",
  listActive: "rgba(56, 139, 253, 0.15)",
};

export const appTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  cssVar: { key: "clipora" },
  hashed: false,
  token: {
    colorPrimary: vs.accent,
    colorInfo: vs.info,
    colorSuccess: vs.success,
    colorWarning: vs.warning,
    colorError: vs.error,
    colorLink: vs.link,
    colorBgBase: vs.editor,
    colorTextBase: vs.text,
    colorBgLayout: vs.sideBar,
    colorBgContainer: vs.editor,
    colorBgElevated: vs.widget,
    colorBorder: vs.border,
    colorBorderSecondary: vs.borderSoft,
    borderRadius: 4,
    borderRadiusLG: 6,
    borderRadiusSM: 3,
    borderRadiusXS: 2,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui, Ubuntu, 'Droid Sans', sans-serif",
    fontFamilyCode: "Menlo, Monaco, 'Cascadia Code', Consolas, 'Courier New', monospace",
    fontSize: 13,
    controlHeight: 28,
    wireframe: false,
  },
  components: {
    Layout: { siderBg: vs.sideBar, headerBg: vs.sideBar, bodyBg: vs.editor, headerHeight: 40, headerPadding: "0 12px" },
    Card: { colorBgContainer: vs.widget },
    Splitter: { splitBarSize: 1, splitBarDraggableSize: 0 },
    Tabs: { horizontalMargin: "0 0 8px 0" },
    Button: { primaryShadow: "none", defaultShadow: "none", dangerShadow: "none", fontWeight: 400 },
    Input: { colorBgContainer: vs.input, activeShadow: "none" },
    InputNumber: { colorBgContainer: vs.input, activeShadow: "none" },
    Select: { colorBgContainer: vs.input, optionSelectedBg: vs.listActive },
    Segmented: { itemSelectedBg: vs.listActive, trackBg: vs.sideBar, itemSelectedColor: "#ffffff" },
    Menu: { itemSelectedBg: vs.listActive, itemHoverBg: vs.listHover, darkItemBg: vs.sideBar },
    Table: { rowHoverBg: vs.listHover, rowSelectedBg: vs.listActive, rowSelectedHoverBg: vs.listActive, headerBg: vs.sideBar },
    Tag: { defaultBg: vs.input },
    Tooltip: { colorBgSpotlight: vs.widget },
    Drawer: { colorBgElevated: vs.sideBar },
    Modal: { contentBg: vs.widget, headerBg: vs.widget },
  },
};

// Workbench chrome that has no antd token: the status bar at the bottom of the editor, and the agent's colour.
export const ideColors = {
  statusBar: vs.sideBar,
  statusBarText: vs.text,
  statusBarBusy: vs.accent, // the status bar turns blue while the agent works
  statusBarBusyText: "#ffffff",
  agent: "#ab7df8", // the agent's mark: GitHub's "done" purple, distinct from the blue accent
  listHover: vs.listHover,
  listActive: vs.listActive,
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
