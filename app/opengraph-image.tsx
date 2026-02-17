import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "OpenChess — Anonymous Real-Time Chess";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            color: "#c9a84c",
            letterSpacing: "-0.02em",
          }}
        >
          OpenChess
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#a1a1aa",
            marginTop: 16,
          }}
        >
          Anonymous real-time chess. Share a link and play.
        </div>
      </div>
    ),
    { ...size },
  );
}
