"use client";
import { PlayCircleOutlined } from "@ant-design/icons";
import { Welcome } from "@ant-design/x";
import { Button, Card, Flex, Form, Input, Result, theme } from "antd";
import { useSyncExternalStore } from "react";
import { AUTH_MODE, getToken, onAuthChange, signInDev } from "@/lib/auth";

function useToken(): string | null | undefined {
  return useSyncExternalStore(
    onAuthChange,
    () => getToken(),
    () => undefined, // server render: unknown until the browser reads storage
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const token = useToken();
  const { token: t } = theme.useToken();
  if (token === undefined) return null;
  if (token) return <>{children}</>;

  return (
    <Flex align="center" justify="center" style={{ minHeight: "100vh", background: t.colorBgLayout, padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 420 }}>
        <Welcome
          variant="borderless"
          icon={<PlayCircleOutlined style={{ fontSize: 36, color: t.colorPrimary }} />}
          title="Clipora AI"
          description="Turn long videos into short clips. Chat about what you want, adjust the plan, export when it looks right."
        />
        {AUTH_MODE === "dev" ? (
          <Form layout="vertical" onFinish={(v: { email: string }) => signInDev(v.email)} style={{ marginTop: 16 }}>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, type: "email", message: "Enter your email" }]}
              extra="Local development sign-in. No password needed."
            >
              <Input autoFocus placeholder="you@example.com" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>
              Sign in
            </Button>
          </Form>
        ) : (
          // TODO(cognito): redirect to the Cognito Hosted UI, exchange the code, and store the token via setToken().
          <Result status="info" title="Sign-in is not set up yet" subTitle="Cognito sign-in is coming soon." />
        )}
      </Card>
    </Flex>
  );
}
