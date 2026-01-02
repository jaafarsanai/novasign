import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ImageEditorModal.css";
import { X, RotateCw } from "lucide-react";

export type EditedImageResult = {
  blob: Blob;
};

type UploadDraftLike = {
  id: string;
  file?: File;
  editedPreviewUrl?: string;
  name: string;
};

type Props = {
  open: boolean;
  draft: UploadDraftLike;
  onClose: () => void;
  onApply: (r: EditedImageResult) => void;
};

function toObjectUrl(file: File) {
  return URL.createObjectURL(file);
}

async function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function ImageEditorModal({ open, draft, onClose, onApply }: Props) {
  const [angle, setAngle] = useState(0);
  const [circle, setCircle] = useState(false);
  const [zoom, setZoom] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceUrl = useMemo(() => {
    if (draft.editedPreviewUrl) return draft.editedPreviewUrl;
    if (draft.file) return toObjectUrl(draft.file);
    return "";
  }, [draft.editedPreviewUrl, draft.file]);

  useEffect(() => {
    if (!open) return;
    setAngle(0);
    setCircle(false);
    setZoom(1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    (async () => {
      if (!sourceUrl) return;
      const img = await imageFromUrl(sourceUrl);
      if (!alive) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // fixed preview size similar to ScreenCloud editor
      const W = 920;
      const H = 460;
      canvas.width = W;
      canvas.height = H;

      // Draw background
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      // Compute center-crop with zoom
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;

      // Fit image into canvas, then apply zoom and center crop
      const fit = Math.max(W / iw, H / ih); // cover
      const scale = fit * zoom;

      const dw = iw * scale;
      const dh = ih * scale;

      const cx = (W - dw) / 2;
      const cy = (H - dh) / 2;

      ctx.save();

      // circle mask preview
      if (circle) {
        ctx.beginPath();
        const r = Math.min(W, H) * 0.42;
        ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
      }

      // rotate around center
      ctx.translate(W / 2, H / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.translate(-W / 2, -H / 2);

      ctx.drawImage(img, cx, cy, dw, dh);

      ctx.restore();

      // overlay crop boundary
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(8, 8, W - 16, H - 16);
    })().catch(() => {
      /* ignore */
    });

    return () => {
      alive = false;
    };
  }, [open, sourceUrl, angle, circle, zoom]);

  async function exportBlob() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
    });
  }

  if (!open) return null;

  return (
    <div className="ie-backdrop" role="dialog" aria-modal="true" aria-label="Image editor" onMouseDown={onClose}>
      <div className="ie-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ie-header">
          <div className="ie-breadcrumb">
            <span className="ie-bc-muted">Media Picker</span>
            <span className="ie-bc-sep">›</span>
            <span>Uploading to Library</span>
          </div>

          <button className="ie-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="ie-body">
          <aside className="ie-tools">
            <button className="ie-tool" onClick={() => setZoom((z) => clamp(z + 0.1, 1, 2))} title="Zoom in">
              +
            </button>
            <button className="ie-tool" onClick={() => setZoom((z) => clamp(z - 0.1, 1, 2))} title="Zoom out">
              –
            </button>
            <button className="ie-tool" onClick={() => setCircle((c) => !c)} title="Circle mask">
              ○
            </button>
            <button className="ie-tool" onClick={() => setAngle((a) => (a + 90) % 360)} title="Rotate 90°">
              <RotateCw size={16} />
            </button>
          </aside>

          <div className="ie-canvas-wrap">
            <canvas ref={canvasRef} className="ie-canvas" />
          </div>
        </div>

        <div className="ie-footer">
          <button className="ie-btn" onClick={() => { setAngle(0); setCircle(false); setZoom(1); }}>
            Reset
          </button>

          <button
            className="ie-btn ie-btn-primary"
            onClick={async () => {
              const b = await exportBlob();
              if (!b) return;
              onApply({ blob: b });
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

