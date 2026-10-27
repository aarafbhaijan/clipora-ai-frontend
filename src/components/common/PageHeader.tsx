"use client";
import { Flex, theme, Typography } from "antd";

/** Page title row. Leaves room on the left for the sidebar toggle. */
export default function PageHeader({ title, extra }: { title: React.ReactNode; extra?: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Flex
      align="center"
      justify="space-between"
      gap={12}
      wrap
      style={{
        minHeight: 56,
        padding: "8px 16px 8px 56px",
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
      }}
    >
      <Typography.Title level={4} style={{ margin: 0, minWidth: 0 }} ellipsis>
        {title}
      </Typography.Title>
      {extra}
    </Flex>
  );
}
