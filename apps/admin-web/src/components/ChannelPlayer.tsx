// /opt/pulsepanels/apps/player-web/src/components/ChannelPlayer.tsx
import React, { useMemo } from "react";
import { pickFullscreenOverride } from "../lib/scheduling";
import FullscreenItem from "./FullscreenItem";

// Replace with your existing layout renderer
function LayoutRenderer({ channel }: { channel: any }) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      {/* TODO: your normal multi-zone renderer */}
      <pre style={{ color: "white" }}>{JSON.stringify(channel.layoutId, null, 2)}</pre>
    </div>
  );
}

export default function ChannelPlayer({ channel }: { channel: any }) {
  const fullscreen = useMemo(() => {
    return pickFullscreenOverride(channel?.zones ?? {}, new Date());
  }, [channel]);

  if (fullscreen) {
    return (
      <div className="ns-fs-root">
        <FullscreenItem item={fullscreen.item as any} />
      </div>
    );
  }

  return (
    <div className="ns-player-root">
      <LayoutRenderer channel={channel} />
    </div>
  );
}
