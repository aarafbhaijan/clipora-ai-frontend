"use client";
// Effect picker (design.md section 5): a Popover holding a grid of Cards, with a duration Slider.
import { Button, Card, Flex, Popover, Slider, Tag, theme, Typography } from "antd";
import { useState } from "react";
import type { Transition, TransitionType } from "@/api/types";
import { CATALOGUE, MAX_DURATION_S, MIN_DURATION_S } from "@/lib/transitions";

interface Props {
  value: Transition;
  onApply: (type: TransitionType, durationS: number, all: boolean) => void;
  children: React.ReactElement;
}

export default function EffectPicker({ value, onApply, children }: Props) {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransitionType>(value.type);
  const [duration, setDuration] = useState(value.duration_s);

  const content = (
    <Flex vertical gap={12} style={{ width: 340 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {CATALOGUE.map((t) => (
          <Card
            key={t.type}
            size="small"
            hoverable
            onClick={() => setType(t.type)}
            role="radio"
            aria-checked={type === t.type}
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setType(t.type)}
            style={{
              borderColor: type === t.type ? token.colorPrimary : undefined,
              background: type === t.type ? token.colorPrimaryBg : undefined,
              textAlign: "center",
              cursor: "pointer",
            }}
            styles={{ body: { padding: 8 } }}
          >
            <Typography.Text style={{ fontSize: token.fontSizeSM }}>{t.label}</Typography.Text>
            {t.approximate ? (
              <div>
                <Tag style={{ marginTop: 4, marginInlineEnd: 0, fontSize: 11 }}>approx. preview</Tag>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      <div>
        <Typography.Text type="secondary">Duration {type === "cut" ? "(a cut has none)" : `${duration.toFixed(1)} s`}</Typography.Text>
        <Slider
          min={MIN_DURATION_S}
          max={MAX_DURATION_S}
          step={0.1}
          value={duration}
          disabled={type === "cut"}
          onChange={setDuration}
          aria-label="Transition duration"
        />
      </div>
      <Flex justify="end" gap={8}>
        <Button
          onClick={() => {
            onApply(type, duration, true);
            setOpen(false);
          }}
        >
          Use for all
        </Button>
        <Button
          type="primary"
          onClick={() => {
            onApply(type, duration, false);
            setOpen(false);
          }}
        >
          Apply here
        </Button>
      </Flex>
    </Flex>
  );

  return (
    <Popover
      content={content}
      title="Transition"
      trigger="click"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setType(value.type);
          setDuration(value.duration_s);
        }
      }}
    >
      {children}
    </Popover>
  );
}
