import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default function Icon() {
  const buffer = fs.readFileSync(path.join(process.cwd(), "public", "canva-monograma.png"));
  const src = `data:image/png;base64,${buffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: 512, height: 512, background: "#0D0E12", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={820} height={820} style={{ objectFit: "contain" }} alt="" />
      </div>
    ),
    { ...size }
  );
}
