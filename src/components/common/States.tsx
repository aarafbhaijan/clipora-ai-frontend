"use client";
// Shared loading, empty and error states (design.md section 7).
import { Button, Empty, Flex, Result, Skeleton } from "antd";
import { errorMessage } from "@/api/client";

export function Loading({ rows = 4 }: { rows?: number }) {
  return <Skeleton active paragraph={{ rows }} />;
}

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Result
      status="error"
      title={title ?? "Couldn't load this"}
      subTitle={errorMessage(error)}
      extra={onRetry ? <Button onClick={onRetry}>Retry</Button> : undefined}
    />
  );
}

export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <Flex justify="center" style={{ padding: 24 }}>
      <Empty description={text}>{action}</Empty>
    </Flex>
  );
}
