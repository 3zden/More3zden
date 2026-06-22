"use client";

import dynamic from "next/dynamic";

const GrainGradientCanvas = dynamic(
  () =>
    import("@paper-design/shaders-react").then((mod) => {
      const { GrainGradient } = mod;
      return function GrainGradientCanvas() {
        return (
          <GrainGradient
            style={{ height: "100%", width: "100%", display: "block" }}
            colorBack="hsl(0, 0%, 0%)"
            softness={0.76}
            intensity={0.65}
            noise={0.12}
            shape="corners"
            offsetX={0}
            offsetY={0}
            scale={1.1}
            rotation={0}
            speed={1.2}
            colors={[
              "hsl(14, 100%, 57%)",
              "hsl(45, 100%, 51%)",
              "hsl(340, 82%, 52%)",
            ]}
          />
        );
      };
    }),
  { ssr: false }
);

export function GradientBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full overflow-hidden"
    >
      <GrainGradientCanvas />
    </div>
  );
}
