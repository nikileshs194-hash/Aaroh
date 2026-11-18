import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QR({ text, size = 200, className = "" }: { text: string; size?: number; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0B1B33", light: "#FFFFFF" } })
      .then(setSvg).catch(() => setSvg(""));
  }, [text]);
  return (
    <div className={`rounded-card bg-white p-2 ${className}`} style={{ width: size, height: size }} role="img" aria-label={`QR code for ${text}`}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
