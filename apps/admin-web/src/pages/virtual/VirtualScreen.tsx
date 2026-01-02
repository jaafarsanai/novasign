import React from "react";

interface VirtualScreenProps {
  code: string;
}

export const VirtualScreen: React.FC<VirtualScreenProps> = ({ code }) => {
  const [copied, setCopied] = React.useState(false);

  const normalized = code.replace(/\s+/g, "").toUpperCase();
  const spacedCode = normalized.split("").join(" ");

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(normalized);
      } else {
        // Fallback for older browsers
        const ta = document.createElement("textarea");
        ta.value = normalized;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy pairing code", e);
    }
  };

  return (
    <div className="virtual-wrapper">
      {/* Big TV card */}
      <div className="virtual-card">
        {/* LEFT SIDE – text + code */}
        <div className="virtual-card-left">
          <div className="virtual-pill">
            NOVASIGN VIRTUAL SCREEN
          </div>

          <h1 className="virtual-title">Pair device</h1>
          <p className="virtual-subtitle">
            Log in to your Novasign dashboard and enter this code:
          </p>

          <button
            type="button"
            className="virtual-code-box"
            onClick={handleCopy}
          >
            <div className="virtual-code-text">{spacedCode}</div>
            <span className="virtual-code-hint">Click code to copy</span>
          </button>
        </div>

        {/* RIGHT SIDE – gradient + QR box */}
        <div className="virtual-card-right">
          <div className="virtual-qr-panel">
            <div className="virtual-qr-square" />
            <p className="virtual-qr-text">
              Or scan this QR code to log in
              <br />
              and pair this screen
            </p>
          </div>
        </div>
      </div>

      {/* FOOTER STRIP */}
      <div className="virtual-footer">
        <div className="virtual-footer-icon" />
        <div className="virtual-footer-text">
          <div className="virtual-footer-title">Novasign Virtual Screen</div>
          <div className="virtual-footer-subtitle">
            If you close this tab you can relaunch it from the screens section.
          </div>
        </div>
      </div>

      {/* Copy toast */}
      {copied && (
        <div className="virtual-toast">
          Pairing code copied to clipboard
        </div>
      )}
    </div>
  );
};

