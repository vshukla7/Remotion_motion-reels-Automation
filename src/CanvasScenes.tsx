import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

// 2D spatial canvas + camera controller. Every stage is mounted persistently
// on ONE canvas; the camera (CanvasViewport) pans/zooms between fixed positions
// and never cuts. Derived from the same model described in Scenes.tsx.

export type CameraKeyframe = {
    frame: number;
    x: number;
    y: number;
    zoom: number;
};

export const CanvasViewport: React.FC<{
    cameraKeyframes: CameraKeyframe[];
    children: React.ReactNode;
}> = ({ cameraKeyframes, children }) => {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();

    let prevIndex = 0;
    for (let i = 0; i < cameraKeyframes.length; i++) {
        if (frame >= cameraKeyframes[i].frame) {
            prevIndex = i;
        }
    }
    const nextIndex = Math.min(prevIndex + 1, cameraKeyframes.length - 1);

    const startKF = cameraKeyframes[prevIndex];
    const endKF = cameraKeyframes[nextIndex];
    const isTransitioning = startKF.frame !== endKF.frame;

    const progress = isTransitioning
        ? interpolate(frame, [startKF.frame, endKF.frame], [0, 1], {
              easing: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
          })
        : 0;

    const cameraX = interpolate(progress, [0, 1], [startKF.x, endKF.x]);
    const cameraY = interpolate(progress, [0, 1], [startKF.y, endKF.y]);
    const cameraZoom = interpolate(progress, [0, 1], [startKF.zoom, endKF.zoom]);

    return (
        <AbsoluteFill style={{ backgroundColor: "#0D0E12", overflow: "hidden" }}>
            <div
                style={{
                    position: "absolute",
                    width,
                    height,
                    left: "50%",
                    top: "50%",
                    transform: `translate(-50%, -50%) scale(${cameraZoom}) translate(${-cameraX}px, ${-cameraY}px)`,
                    transformOrigin: "center center",
                    willChange: "transform",
                }}
            >
                {children}
            </div>
        </AbsoluteFill>
    );
};

export const CanvasNode: React.FC<{
    x: number;
    y: number;
    width?: number;
    height?: number;
    children: React.ReactNode;
}> = ({ x, y, width = 1080, height = 1920, children }) => {
    return (
        <div
            style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width,
                height,
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                borderRadius: 32,
                overflow: "hidden",
                boxShadow: "0 50px 100px rgba(0,0,0,0.3)",
            }}
        >
            {children}
        </div>
    );
};
