// /opt/novasign/apps/player-web/src/components/FullscreenItem.tsx
import React from "react";

type ZoneContentItem = {
  sourceType: "media" | "playlist";
  sourceId: string;
  name: string;
  mediaType?: "image" | "video";
  durationSec: number;
  order: number;

  // optional if your backend embeds it
  url?: string | null;
  thumbnailUrl?: string | null;
};

function resolveItemUrl(item: any): string | null {
  // Adjust these fields to match your backend payload
  return item?.url ?? item?.fileUrl ?? item?.downloadUrl ?? item?.previewUrl ?? null;
}

export default function FullscreenItem({ item }: { item: ZoneContentItem }) {
  const url = resolveItemUrl(item);

  if (item.sourceType === "media" && item.mediaType === "video") {
    return url ? (
      <video
        src={url}
        autoPlay
        muted
        playsInline
        preload="auto"
        className="ns-fs-media"
      />
    ) : (
      <div className="ns-fs-empty">No video URL</div>
    );
  }

  if (item.sourceType === "media" && item.mediaType === "image") {
    return url ? <img src={url} className="ns-fs-media" alt="" /> : <div className="ns-fs-empty">No image URL</div>;
  }

  // Playlist case: you likely already have a playlist player component.
  // Replace this with your real playlist player.
  return (
    <div className="ns-fs-empty">
      Playlist fullscreen not wired yet. playlistId: {item.sourceId}
    </div>
  );
}
