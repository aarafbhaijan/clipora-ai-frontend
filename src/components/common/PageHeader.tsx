"use client";
import { Flex, theme, Typography } from "antd";

/** Page title row, compact like VS Code's title bar. Leaves room on the left for the sidebar toggle. */
export default function PageHeader({ title, extra }: { title: React.ReactNode; extra?: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Flex
      align="center"
      justify="space-between"
      gap={12}
      wrap
      style={{
        minHeight: 40,
        padding: "4px 12px 4px 48px",
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgLayout,
      }}
    >
      <Typography.Text strong style={{ margin: 0, minWidth: 0, flex: 1, fontSize: token.fontSize }} ellipsis={{ tooltip: title }}>
        {title}
      </Typography.Text>
      {extra}
    </Flex>
  );
}
