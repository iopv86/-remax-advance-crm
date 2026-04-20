import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "#0D0E12",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            fontSize: 90,
            fontWeight: 700,
            color: "#C9963A",
            letterSpacing: "-3px",
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
