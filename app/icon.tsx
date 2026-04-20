import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: "#0D0E12",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 80,
        }}
      >
        <div
          style={{
            fontSize: 260,
            fontWeight: 700,
            color: "#C9963A",
            letterSpacing: "-8px",
            lineHeight: 1,
            display: "flex",
          }}
        >
          AE
        </div>
      </div>
    ),
    { ...size }
  );
}
