"use client";
// Source player: the original video before there is a plan. Plays the proxy at the source aspect ratio with
// the transcript as captions. Shares the player store with the transcript, timeline and keyboard, so a cue
// click seeks here and Space plays and pauses.
import { CaretRightFilled, PauseOutlined } from "@ant-design/icons";
import { Button, Flex, Result, Slider, theme, Typography } from "antd";
import { useEffect, useRef, useState } from "react";
import { clock } from "@/lib/format";
import { usePlayer } from "@/lib/playerStore";
import { cueAt, type Transcript } from "@/lib/transcript";
import { mediaColors } from "@/theme";
import type { SpeakerOut } from "@/api/types";
import { useVideoSrc } from "./Quality";
import SpeakerOverlay from "./SpeakerOverlay";
import VolumeControl, { useApplyVolume } from "./VolumeControl";

interface Props {
  speaker?: SpeakerOut;
  proxyUrl: string | null | undefined;
  sourceUrl?: string | null;
  transcript: Transcript | undefined;
  durationS: number;
}

const PUBLISH_MS = 66;

export default function SourcePlayer({ proxyUrl, sourceUrl, transcript, durationS, speaker }: Props) {
  const { token } = theme.useToken();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastPublish = useRef(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const seek = usePlayer((s) => s.seek);
  const showSpeaker = usePlayer((s) => s.showSpeaker);
  const toggleRequest = usePlayer((s) => s.toggleRequest);
  const setPlayer = usePlayer((s) => s.set);
  const video = useVideoSrc(proxyUrl, sourceUrl);

  const publish = (time: number, force = false) => {
    const now = performance.now();
    if (!force && now - lastPublish.current < PUBLISH_MS) return;
    lastPublish.current = now;
    setT(time);
    setPlayer({ sourceMode: true, sourceTime: time });
  };

  // Seek requests from the transcript, timeline and citations.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || seek.src === undefined) return;
    v.currentTime = seek.src;
    publish(seek.src, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek.n]);

  // Switching videos stops this player too.
  const stopRequest = usePlayer((s) => s.stopRequest);
  useEffect(() => {
    if (stopRequest) videoRef.current?.pause();
  }, [stopRequest]);

  // Space (EditorPage) and other play/pause requests.
  useEffect(() => {
    const v = videoRef.current;
    if (!toggleRequest || !v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, [toggleRequest]);

  useApplyVolume(() => [videoRef.current]);

  const cue = transcript ? cueAt(transcript.cues, t) : undefined;
  const togglePlay = () => usePlayer.getState().toggle();

  if (!proxyUrl) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Typography.Text type="secondary">Preparing your video…</Typography.Text>
      </Flex>
    );
  }
  if (loadError) {
    return (
      <Result
        status="warning"
        title="The video didn't load"
        extra={<Button onClick={() => setLoadError(false)}>Try again</Button>}
      />
    );
  }

  return (
    <Flex vertical style={{ height: "100%", padding: token.paddingSM, gap: token.paddingXS }}>
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          background: mediaColors.letterbox,
          borderRadius: token.borderRadiusLG,
          overflow: "hidden",
          cursor: "pointer",
        }}
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={video.src ?? undefined}
          crossOrigin="anonymous"
          playsInline
          preload="auto"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          onPlay={() => {
            setPlaying(true);
            setPlayer({ playing: true, sourceMode: true });
          }}
          onPause={() => {
            setPlaying(false);
            setPlayer({ playing: false });
          }}
          onTimeUpdate={(e) => publish(e.currentTarget.currentTime)}
          onSeeked={(e) => publish(e.currentTarget.currentTime, true)}
          // Switching between the editor copy and the original reloads the video: stay at the same moment.
          onLoadedMetadata={(e) => {
            if (t > 0) e.currentTarget.currentTime = t;
          }}
          onEmptied={() => {
            setPlaying(false);
            setPlayer({ playing: false });
          }}
          onError={() => video.fellBack() || setLoadError(true)}
          aria-label="Original video"
        />
        {showSpeaker ? (
          <SpeakerOverlay
            speaker={speaker}
            view={() => {
              const v = videoRef.current;
              return v ? { srcTime: v.currentTime, window: null, videoW: v.videoWidth, videoH: v.videoHeight } : null;
            }}
          />
        ) : null}
        {cue ? (
          <div
            style={{
              position: "absolute",
              left: "8%",
              right: "8%",
              bottom: "8%",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                background: token.colorBgMask,
                color: token.colorWhite,
                padding: `${token.paddingXXS}px ${token.paddingXS}px`,
                borderRadius: token.borderRadiusSM,
                fontSize: token.fontSizeLG,
                lineHeight: 1.6,
                boxDecorationBreak: "clone",
                WebkitBoxDecorationBreak: "clone",
              }}
            >
              {cue.text}
            </span>
          </div>
        ) : null}
      </div>
      <Flex align="center" gap={token.paddingSM}>
        <Button
          type="text"
          shape="circle"
          icon={playing ? <PauseOutlined /> : <CaretRightFilled />}
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
        />
        <Typography.Text type="secondary" style={{ fontVariantNumeric: "tabular-nums", minWidth: 96 }}>
          {clock(t)} / {clock(durationS)}
        </Typography.Text>
        <Slider
          style={{ flex: 1 }}
          min={0}
          max={Math.max(durationS, 0.1)}
          step={0.1}
          value={t}
          tooltip={{ formatter: (v) => clock(v ?? 0) }}
          onChange={(v) => usePlayer.getState().seekSource(v)}
          aria-label="Position in the video"
        />
        <VolumeControl />
      </Flex>
    </Flex>
  );
}
