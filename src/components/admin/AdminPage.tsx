"use client";
// Admin area (design.md "Admin area"): limits, users and AI usage. Admins see numbers and titles only,
// never another user's videos, transcripts, chats or plans.
import { CrownOutlined, UndoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Result,
  Segmented,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { api, errorMessage, unwrap } from "@/api/client";
import { keys, useMe } from "@/api/hooks";
import type { AdminUserRow, LimitKey, LimitSpecOut, TokenTotals, UsageGroup } from "@/api/types";
import { formatBytes, formatCost, formatTokens } from "@/lib/format";
import PageHeader from "../common/PageHeader";
import { ErrorState, Loading } from "../common/States";

type Range = [Dayjs, Dayjs];
const thisMonth = (): Range => [dayjs().startOf("month"), dayjs()];
const fmt = (d: Dayjs) => d.format("YYYY-MM-DD");

const KIND_LABEL: Record<string, string> = {
  agent: "Planning and edits",
  suggest: "Ideas",
  metadata: "Titles and hashtags",
  distill: "Learning",
};

function CostText({ t }: { t: TokenTotals }) {
  if (t.cost_usd === null || t.cost_usd === undefined) {
    return t.calls ? (
      <Tooltip title="No price is set for the model used. Add it to the price table to see a cost.">
        <Typography.Text type="secondary">No price set</Typography.Text>
      </Tooltip>
    ) : (
      <Typography.Text type="secondary">—</Typography.Text>
    );
  }
  return (
    <Tooltip title={t.unpriced_calls ? `${t.unpriced_calls} calls have no price and are not included.` : "Estimated from token counts."}>
      <span>
        {formatCost(t.cost_usd)} <Typography.Text type="secondary">est.</Typography.Text>
      </span>
    </Tooltip>
  );
}

const tokenColumns = <T extends { tokens: TokenTotals }>(): TableColumnsType<T> => [
  {
    title: "Tokens in",
    key: "in",
    align: "right",
    sorter: (a, b) => a.tokens.input_tokens - b.tokens.input_tokens,
    render: (_, r) => formatTokens(r.tokens.input_tokens),
  },
  {
    title: "Tokens out",
    key: "out",
    align: "right",
    sorter: (a, b) => a.tokens.output_tokens - b.tokens.output_tokens,
    render: (_, r) => formatTokens(r.tokens.output_tokens),
  },
  {
    title: "Calls",
    key: "calls",
    align: "right",
    sorter: (a, b) => a.tokens.calls - b.tokens.calls,
    render: (_, r) => r.tokens.calls,
  },
  {
    title: "Estimated cost",
    key: "cost",
    align: "right",
    sorter: (a, b) => Number(a.tokens.cost_usd ?? 0) - Number(b.tokens.cost_usd ?? 0),
    render: (_, r) => <CostText t={r.tokens} />,
  },
];

function limitLabel(spec: Pick<LimitSpecOut, "unit">, v: number): string {
  if (spec.unit === "MB") return v >= 1024 ? `${+(v / 1024).toFixed(1)} GB` : `${v} MB`;
  if (spec.unit === "seconds") return `${Math.round(v / 60)} min`;
  return `${v} ${spec.unit}`;
}

function LimitsTab() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<Record<string, number>>();
  const q = useQuery({ queryKey: keys.adminSettings, queryFn: () => unwrap(api.GET("/api/admin/settings")) });
  const save = useMutation({
    mutationFn: (values: Record<string, number>) => unwrap(api.PATCH("/api/admin/settings", { body: { values } })),
    onSuccess: (data, values) => {
      qc.setQueryData(keys.adminSettings, data);
      const changed = Object.keys(values).length;
      message.success(changed ? `Saved ${changed} limit${changed > 1 ? "s" : ""}.` : "Nothing changed.");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const limits = q.data.limits;

  return (
    <Card style={{ maxWidth: 640 }}>
      <Typography.Paragraph type="secondary">
        These apply to every editor unless you set an override for one user. Lowering a limit never removes existing
        videos; it only stops new uploads.
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        initialValues={Object.fromEntries(limits.map((l) => [l.key, l.value]))}
        onFinish={(v) => {
          const changed = Object.fromEntries(limits.filter((l) => v[l.key] !== l.value).map((l) => [l.key, v[l.key]]));
          save.mutate(changed);
        }}
      >
        {limits.map((l) => (
          <Form.Item
            key={l.key}
            name={l.key}
            label={l.label}
            extra={`${limitLabel(l, l.minimum)} to ${limitLabel(l, l.maximum)}. Default ${limitLabel(l, l.default)}.`}
            rules={[{ required: true, message: "Enter a value" }]}
          >
            <InputNumber min={l.minimum} max={l.maximum} precision={0} addonAfter={l.unit} style={{ width: 220 }} />
          </Form.Item>
        ))}
        <Button type="primary" htmlType="submit" loading={save.isPending}>
          Save limits
        </Button>
      </Form>
    </Card>
  );
}

function UserDrawer({ userId, range, onClose, myId }: { userId: string | null; range: Range; onClose: () => void; myId?: string }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [start, end] = [fmt(range[0]), fmt(range[1])];
  const settings = useQuery({ queryKey: keys.adminSettings, queryFn: () => unwrap(api.GET("/api/admin/settings")) });
  const q = useQuery({
    queryKey: keys.adminUser(userId ?? "none", start, end),
    enabled: !!userId,
    queryFn: () =>
      unwrap(api.GET("/api/admin/users/{user_id}", { params: { path: { user_id: userId! }, query: { start, end } } })),
  });
  const patch = useMutation({
    mutationFn: (body: { role?: "admin" | "editor"; overrides?: Record<string, number | null> }) =>
      unwrap(api.PATCH("/api/admin/users/{user_id}", { params: { path: { user_id: userId! } }, body })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      message.success("Saved.");
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const [draft, setDraft] = useState<Record<string, number | null>>({});

  const d = q.data;
  const groupCols = (title: string): TableColumnsType<UsageGroup> => [
    { title, dataIndex: "label", key: "label", ellipsis: true },
    ...tokenColumns<UsageGroup>(),
  ];

  return (
    <Drawer open={!!userId} onClose={onClose} size={720} title={d?.user.email ?? "User"} destroyOnHidden>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !d ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Flex vertical gap={16}>
          <Flex gap={16} wrap>
            <Statistic title="Videos" value={d.user.active_videos} />
            <Statistic title="Storage" value={formatBytes(d.user.storage_bytes)} />
            <Statistic title="Tokens in" value={formatTokens(d.user.tokens.input_tokens)} />
            <Statistic title="Tokens out" value={formatTokens(d.user.tokens.output_tokens)} />
            <Statistic title="Estimated cost" value={formatCost(d.user.tokens.cost_usd)} />
          </Flex>

          <Card size="small" title="Role">
            <Flex align="center" gap={8}>
              <Tag color={d.user.role === "admin" ? "gold" : undefined}>{d.user.role === "admin" ? "Admin" : "Editor"}</Tag>
              <Popconfirm
                title={d.user.role === "admin" ? "Make this person an editor?" : "Make this person an admin?"}
                description={d.user.role === "admin" ? "They will lose access to this page." : "They will see limits and usage for everyone."}
                onConfirm={() => patch.mutate({ role: d.user.role === "admin" ? "editor" : "admin" })}
                disabled={d.user.id === myId}
              >
                <Button size="small" disabled={d.user.id === myId} icon={<CrownOutlined />}>
                  {d.user.role === "admin" ? "Make editor" : "Make admin"}
                </Button>
              </Popconfirm>
              {d.user.id === myId ? <Typography.Text type="secondary">You can&apos;t change your own role.</Typography.Text> : null}
            </Flex>
          </Card>

          <Card size="small" title="Limits for this user">
            <Flex vertical gap={8}>
              {(settings.data?.limits ?? []).map((spec) => {
                const key = spec.key as LimitKey;
                const override = d.overrides[key];
                const value = key in draft ? draft[key] : (override ?? null);
                return (
                  <Flex key={key} align="center" gap={8} wrap>
                    <Typography.Text style={{ width: 170 }}>{spec.label}</Typography.Text>
                    <InputNumber
                      min={spec.minimum}
                      max={spec.maximum}
                      precision={0}
                      placeholder={`${spec.value} (everyone)`}
                      value={value ?? undefined}
                      addonAfter={spec.unit}
                      onChange={(v) => setDraft((x) => ({ ...x, [key]: v ?? null }))}
                      style={{ width: 220 }}
                    />
                    {override !== undefined ? (
                      <Button
                        size="small"
                        icon={<UndoOutlined />}
                        onClick={() => {
                          setDraft((x) => ({ ...x, [key]: null }));
                          patch.mutate({ overrides: { [key]: null } });
                        }}
                      >
                        Use everyone&apos;s limit
                      </Button>
                    ) : (
                      <Typography.Text type="secondary">Everyone&apos;s limit: {limitLabel(spec, spec.value)}</Typography.Text>
                    )}
                  </Flex>
                );
              })}
              <Button
                type="primary"
                style={{ alignSelf: "flex-start" }}
                disabled={!Object.keys(draft).length}
                loading={patch.isPending}
                onClick={() => patch.mutate({ overrides: draft }, { onSuccess: () => setDraft({}) })}
              >
                Save limits
              </Button>
            </Flex>
          </Card>

          <Tabs
            items={[
              {
                key: "project",
                label: "By video",
                children: <Table size="small" rowKey="key" pagination={false} dataSource={d.by_project} columns={groupCols("Video")} />,
              },
              {
                key: "kind",
                label: "By feature",
                children: (
                  <Table
                    size="small"
                    rowKey="key"
                    pagination={false}
                    dataSource={d.by_kind.map((g) => ({ ...g, label: KIND_LABEL[g.key] ?? g.label }))}
                    columns={groupCols("Feature")}
                  />
                ),
              },
              {
                key: "day",
                label: "By day",
                children: <Table size="small" rowKey="key" pagination={false} dataSource={d.by_day} columns={groupCols("Day")} />,
              },
            ]}
          />
        </Flex>
      )}
    </Drawer>
  );
}

function UsersTab({ range, setRange, myId }: { range: Range; setRange: (r: Range) => void; myId?: string }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [start, end] = [fmt(range[0]), fmt(range[1])];
  const q = useQuery({
    queryKey: [...keys.adminUsers(start, end, search), cursor],
    queryFn: () =>
      unwrap(api.GET("/api/admin/users", { params: { query: { start, end, q: search || undefined, cursor: cursor ?? undefined } } })),
  });

  const columns: TableColumnsType<AdminUserRow> = [
    { title: "Email", dataIndex: "email", key: "email", ellipsis: true, sorter: (a, b) => a.email.localeCompare(b.email) },
    {
      title: "Role",
      key: "role",
      render: (_, r) => <Tag color={r.role === "admin" ? "gold" : undefined}>{r.role === "admin" ? "Admin" : "Editor"}</Tag>,
    },
    { title: "Videos", dataIndex: "active_videos", key: "videos", align: "right", sorter: (a, b) => a.active_videos - b.active_videos },
    {
      title: "Storage",
      key: "storage",
      align: "right",
      sorter: (a, b) => a.storage_bytes - b.storage_bytes,
      render: (_, r) => formatBytes(r.storage_bytes),
    },
    ...tokenColumns<AdminUserRow>(),
  ];

  return (
    <Flex vertical gap={12}>
      <Flex gap={8} wrap>
        <DatePicker.RangePicker
          value={range}
          allowClear={false}
          onChange={(v) => v && v[0] && v[1] && (setRange([v[0], v[1]]), setCursor(null))}
        />
        <Input.Search
          allowClear
          placeholder="Search by email"
          style={{ maxWidth: 280 }}
          onSearch={(v) => {
            setSearch(v);
            setCursor(null);
          }}
        />
      </Flex>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Table
          rowKey="id"
          size="middle"
          loading={q.isLoading}
          dataSource={q.data?.items ?? []}
          columns={columns}
          pagination={false}
          scroll={{ x: 900 }}
          onRow={(r) => ({ onClick: () => setOpen(r.id), style: { cursor: "pointer" } })}
          locale={{ emptyText: "No users found." }}
        />
      )}
      <Flex gap={8}>
        {cursor ? <Button onClick={() => setCursor(null)}>First page</Button> : null}
        {q.data?.next_cursor ? <Button onClick={() => setCursor(q.data!.next_cursor)}>Next page</Button> : null}
      </Flex>
      <UserDrawer userId={open} range={range} onClose={() => setOpen(null)} myId={myId} />
    </Flex>
  );
}

function UsageTab({ range, setRange }: { range: Range; setRange: (r: Range) => void }) {
  const [groupBy, setGroupBy] = useState<"user" | "day" | "job_kind">("user");
  const [start, end] = [fmt(range[0]), fmt(range[1])];
  const q = useQuery({
    queryKey: keys.adminUsage(start, end, groupBy),
    queryFn: () => unwrap(api.GET("/api/admin/usage", { params: { query: { start, end, group_by: groupBy } } })),
  });
  const groups = useMemo(
    () => (q.data?.groups ?? []).map((g) => (groupBy === "job_kind" ? { ...g, label: KIND_LABEL[g.key] ?? g.label } : g)),
    [q.data, groupBy],
  );
  const t = q.data?.total;

  return (
    <Flex vertical gap={12}>
      <Flex gap={8} wrap>
        <DatePicker.RangePicker value={range} allowClear={false} onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])} />
        <Segmented
          value={groupBy}
          onChange={(v) => setGroupBy(v as typeof groupBy)}
          options={[
            { label: "By user", value: "user" },
            { label: "By day", value: "day" },
            { label: "By feature", value: "job_kind" },
          ]}
        />
      </Flex>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !t ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <Flex gap={12} wrap>
            <Card size="small"><Statistic title="Tokens in" value={formatTokens(t.input_tokens)} /></Card>
            <Card size="small"><Statistic title="Tokens out" value={formatTokens(t.output_tokens)} /></Card>
            <Card size="small"><Statistic title="AI calls" value={t.calls} /></Card>
            <Card size="small"><Statistic title="Estimated cost" value={formatCost(t.cost_usd)} /></Card>
          </Flex>
          {t.unpriced_calls ? (
            <Alert
              type="info"
              showIcon
              title={`${t.unpriced_calls} calls have no price set, so they are not in the estimated cost.`}
              description="Add the model's prices to the price table to include them."
            />
          ) : null}
          <Table
            rowKey="key"
            size="middle"
            dataSource={groups}
            pagination={{ pageSize: 50, hideOnSinglePage: true }}
            columns={[{ title: groupBy === "user" ? "User" : groupBy === "day" ? "Day" : "Feature", dataIndex: "label", key: "label" }, ...tokenColumns<UsageGroup>()]}
            locale={{ emptyText: "No AI usage in this range." }}
          />
        </>
      )}
    </Flex>
  );
}

export default function AdminPage() {
  const me = useMe();
  const [range, setRange] = useState<Range>(thisMonth);

  if (me.isLoading) return <div style={{ padding: 24 }}><Loading /></div>;
  if (me.data?.role !== "admin")
    return <Result status="403" title="Admins only" subTitle="Only admins can open this page." />;

  return (
    <>
      <PageHeader title="Admin" />
      <div style={{ padding: 16 }}>
        <Tabs
          items={[
            { key: "limits", label: "Limits", children: <LimitsTab /> },
            { key: "users", label: "Users", children: <UsersTab range={range} setRange={setRange} myId={me.data.id} /> },
            { key: "usage", label: "Usage", children: <UsageTab range={range} setRange={setRange} /> },
          ]}
        />
      </div>
    </>
  );
}
