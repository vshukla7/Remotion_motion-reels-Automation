import React from "react";
import { AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CanvasViewport, CanvasNode, CameraKeyframe } from "./CanvasScenes";

// ----------------------------------------------------------------------------
// SFX playback (skill §5 trigger matrix)
// Every stage is mounted for the whole timeline, so each sound is gated with a
// `delay` (frames) equal to the stage's reveal frame — it fires exactly as the
// camera arrives. Available library (assets/sfx/):
//   whoosh.wav    -> low-frequency swoosh for UI motion / pulse climb
//   whip.wav      -> dense impact/stamp snap (chip fracture, bar settle)
//   page-turn.wav -> transition / stroke-draw (attention links)
//   ding.wav      -> soft pop / notification (kinetic mount, selection)
// ----------------------------------------------------------------------------
const Sfx: React.FC<{ file: string; atFrame: number; volume?: number }> = ({
    file,
    atFrame,
    volume = 0.6,
}) => {
    const frame = useCurrentFrame();
    // Mount the one-shot SFX only once the camera has arrived at this stage,
    // so it plays from its start exactly as the stage reveals.
    if (frame < atFrame) return null;
    return <Audio src={staticFile(`sfx/${file}`)} volume={volume} />;
};

/**
 * ============================================================================
 * SCENE: "How an LLM thinks" — visuals only, no text.
 * ============================================================================
 * Same canvas model as CanvasScenes.tsx: everything below is mounted on ONE
 * persistent canvas at all times. The camera (CanvasViewport, imported from
 * CanvasScenes.tsx) pans between six fixed positions — it never cuts. Each
 * stage keys its internal animation off `localFrame = frame - sceneFrame`
 * (sceneFrame = the frame the camera starts panning toward it), so every
 * stage reveals itself exactly as the camera arrives, and directions vary
 * (right, down, left, down, diagonal) so the pans don't feel repetitive.
 *
 * Because this scene is explicitly VISUAL-ONLY, there is no AnimatedText /
 * kinetic typography anywhere in this file — every idea (tokens, attention,
 * layers, prediction, selection) is expressed as shape, motion, and light.
 *
 * No Math.random() is used anywhere (Remotion renders frame-by-frame, often
 * out of order / in parallel — true randomness would make frames
 * inconsistent). Any "organic" placement below uses a fixed sin/cos seed
 * function instead, which is deterministic per index.
 *
 * To register this as its own composition: width=1080, height=1920, fps=60,
 * durationInFrames=LLM_THINKING_DURATION_IN_FRAMES (600 = 10s).
 * ============================================================================
 */

export const LLM_THINKING_DURATION_IN_FRAMES = 600;

const NODE_W = 1080;
const NODE_H = 1920;

// Minimalist canvas per the skill's "no static background image" rule:
// solid off-white + two large blurred corner shapes for a subtle vignette.
const MinimalCanvasBG: React.FC = () => (
    <AbsoluteFill style={{ background: "#F5F5F5" }}>
        <div
            style={{
                position: "absolute",
                top: -220,
                left: -220,
                width: 640,
                height: 640,
                borderRadius: "50%",
                background: "#111111",
                opacity: 0.05,
                filter: "blur(140px)",
            }}
        />
        <div
            style={{
                position: "absolute",
                bottom: -220,
                right: -220,
                width: 640,
                height: 640,
                borderRadius: "50%",
                background: "#111111",
                opacity: 0.05,
                filter: "blur(140px)",
            }}
        />
    </AbsoluteFill>
);

// Deterministic pseudo-scatter — same output every call for a given seed,
// which is what a frame-based renderer needs (never Math.random here).
const seededOffset = (seed: number, spreadX = 240, spreadY = 340) => ({
    x: Math.sin(seed * 12.9898) * spreadX,
    y: Math.cos(seed * 78.233) * spreadY,
});

const TOKEN_COUNT = 7;

/* ============================================================
 * Stage 1 — Tokenize: a solid line (raw input) fractures into chips
 * ============================================================ */
export const TokenizeStage: React.FC<{ sceneFrame?: number }> = ({ sceneFrame = 0 }) => {
    const frame = useCurrentFrame();
    const localFrame = frame - sceneFrame;
    const { fps } = useVideoConfig();

    const chipWidths = [70, 46, 92, 58, 112, 50, 84];

    const lineSpring = spring({ frame: localFrame, fps, config: { damping: 16, stiffness: 120 } });
    const lineWidth = interpolate(lineSpring, [0, 1], [0, 620]);
    const lineFade = interpolate(localFrame, [10, 28], [1, 0.12], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    return (
        <AbsoluteFill>
            <MinimalCanvasBG />
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 64 }}>
                    {/* raw input, represented as a single bar that dissolves as it "breaks apart" */}
                    <div style={{ height: 14, width: lineWidth, background: "#111111", borderRadius: 7, opacity: lineFade }} />

                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", width: 700 }}>
                        {chipWidths.map((w, i) => {
                            const s = spring({
                                frame: localFrame - 20 - i * 6,
                                fps,
                                config: { damping: 12, stiffness: 160, mass: 0.6 },
                            });
                            const scale = interpolate(s, [0, 1], [0.4, 1]);
                            const y = interpolate(s, [0, 1], [24, 0]);
                            return (
                                <div
                                    key={i}
                                    style={{
                                        width: w,
                                        height: 44,
                                        borderRadius: 10,
                                        background: "#111111",
                                        opacity: s,
                                        transform: `translateY(${y}px) scale(${scale})`,
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

/* ============================================================
 * Stage 2 — Embedding space: chips collapse into dots that scatter
 * out onto fixed coordinates in an abstract vector space
 * ============================================================ */
export const EmbeddingStage: React.FC<{ sceneFrame?: number }> = ({ sceneFrame = 0 }) => {
    const frame = useCurrentFrame();
    const localFrame = frame - sceneFrame;
    const { fps } = useVideoConfig();

    const dots = new Array(TOKEN_COUNT).fill(0).map((_, i) => seededOffset(i + 1));
    const axisSpring = spring({ frame: localFrame, fps, config: { damping: 18, stiffness: 90 } });

    return (
        <AbsoluteFill>
            <MinimalCanvasBG />
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
                <div style={{ position: "relative", width: 640, height: 640 }}>
                    {/* faint axes to suggest a coordinate space */}
                    <div
                        style={{
                            position: "absolute",
                            left: "50%",
                            top: 0,
                            bottom: 0,
                            width: 1,
                            background: "#111111",
                            opacity: 0.08 * axisSpring,
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            top: "50%",
                            left: 0,
                            right: 0,
                            height: 1,
                            background: "#111111",
                            opacity: 0.08 * axisSpring,
                        }}
                    />

                    {dots.map((d, i) => {
                        const s = spring({
                            frame: localFrame - 8 - i * 5,
                            fps,
                            config: { damping: 13, stiffness: 110, mass: 0.7 },
                        });
                        const tx = interpolate(s, [0, 1], [0, d.x]);
                        const ty = interpolate(s, [0, 1], [0, d.y]);
                        const size = 22 + (i % 3) * 6;
                        return (
                            <div
                                key={i}
                                style={{
                                    position: "absolute",
                                    left: "50%",
                                    top: "50%",
                                    width: size,
                                    height: size,
                                    borderRadius: "50%",
                                    background: "#111111",
                                    opacity: s,
                                    transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px)`,
                                }}
                            />
                        );
                    })}
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

/* ============================================================
 * Stage 3 — Attention: same dots arranged in a ring, connected by
 * lines whose thickness/opacity encode a fixed attention-weight matrix
 * ============================================================ */
const ATTENTION_LINKS: [number, number, number][] = [
    [0, 1, 0.3],
    [1, 2, 0.6],
    [2, 3, 0.85],
    [3, 4, 0.5],
    [4, 5, 0.4],
    [5, 6, 0.3],
    [2, 6, 0.7],
    [0, 3, 0.35],
    [1, 5, 0.45],
    [3, 6, 0.55],
];

export const AttentionStage: React.FC<{ sceneFrame?: number }> = ({ sceneFrame = 0 }) => {
    const frame = useCurrentFrame();
    const localFrame = frame - sceneFrame;
    const { fps } = useVideoConfig();

    const radius = 260;
    const center = 320;
    const points = new Array(TOKEN_COUNT).fill(0).map((_, i) => {
        const angle = (i / TOKEN_COUNT) * Math.PI * 2 - Math.PI / 2;
        return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
    });

    return (
        <AbsoluteFill>
            <MinimalCanvasBG />
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
                <svg width={640} height={640} viewBox="0 0 640 640">
                    {ATTENTION_LINKS.map(([a, b, weight], i) => {
                        const p1 = points[a];
                        const p2 = points[b];
                        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                        const draw = spring({
                            frame: localFrame - 6 - i * 4,
                            fps,
                            config: { damping: 20, stiffness: 90 },
                        });
                        return (
                            <line
                                key={i}
                                x1={p1.x}
                                y1={p1.y}
                                x2={p2.x}
                                y2={p2.y}
                                stroke="#111111"
                                strokeWidth={1 + weight * 6}
                                strokeOpacity={weight * draw}
                                strokeDasharray={len}
                                strokeDashoffset={len * (1 - draw)}
                            />
                        );
                    })}
                    {points.map((p, i) => {
                        const s = spring({ frame: localFrame - i * 3, fps, config: { damping: 12, stiffness: 140 } });
                        return <circle key={i} cx={p.x} cy={p.y} r={16 * s} fill="#111111" />;
                    })}
                </svg>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

/* ============================================================
 * Stage 4 — Layers: a pulse of light climbs through stacked
 * transformer-layer bars, briefly lighting each as it passes through
 * ============================================================ */
const LAYER_COUNT = 5;

export const LayersStage: React.FC<{ sceneFrame?: number }> = ({ sceneFrame = 0 }) => {
    const frame = useCurrentFrame();
    const localFrame = frame - sceneFrame;
    const { fps } = useVideoConfig();

    const stackW = 560;
    const layerH = 64;
    const gap = 20;
    const stackH = LAYER_COUNT * layerH + (LAYER_COUNT - 1) * gap;

    // Pulse travels bottom -> top once, then loops for a second pass to
    // suggest repeated processing.
    const cycle = 130;
    const t = localFrame % cycle;
    const pulseProgress = interpolate(t, [0, cycle], [0, 1], {
        easing: (x) => x, // linear climb, held together by per-layer springs below
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });
    const pulseY = stackH - pulseProgress * stackH;

    return (
        <AbsoluteFill>
            <MinimalCanvasBG />
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
                <div style={{ position: "relative", width: stackW, height: stackH }}>
                    {new Array(LAYER_COUNT).fill(0).map((_, i) => {
                        const layerTop = stackH - (i + 1) * layerH - i * gap;
                        const layerCenter = layerTop + layerH / 2;
                        const dist = Math.abs(pulseY - layerCenter);
                        const glow = interpolate(dist, [0, layerH], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

                        const mountSpring = spring({
                            frame: localFrame - i * 6,
                            fps,
                            config: { damping: 16, stiffness: 110 },
                        });

                        return (
                            <div
                                key={i}
                                style={{
                                    position: "absolute",
                                    top: layerTop,
                                    left: 0,
                                    width: stackW,
                                    height: layerH,
                                    borderRadius: 16,
                                    background: `rgba(17,17,17,${0.1 + glow * 0.75})`,
                                    border: "1px solid rgba(17,17,17,0.15)",
                                    opacity: mountSpring,
                                    transform: `scaleX(${interpolate(mountSpring, [0, 1], [0.7, 1])})`,
                                }}
                            />
                        );
                    })}

                    {/* the traveling pulse itself */}
                    <div
                        style={{
                            position: "absolute",
                            left: stackW / 2 - 10,
                            top: pulseY - 10,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "#111111",
                            boxShadow: "0 0 30px 10px rgba(17,17,17,0.35)",
                        }}
                    />
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

/* ============================================================
 * Stage 5 — Prediction: a bar per candidate token rises to its
 * probability height (no numbers/labels — height IS the information)
 * ============================================================ */
const CANDIDATE_HEIGHTS = [30, 55, 140, 80, 45, 65, 50];
export const WINNER_INDEX = 2; // tallest bar — used again in Stage 6

export const PredictionStage: React.FC<{ sceneFrame?: number }> = ({ sceneFrame = 0 }) => {
    const frame = useCurrentFrame();
    const localFrame = frame - sceneFrame;
    const { fps } = useVideoConfig();

    return (
        <AbsoluteFill>
            <MinimalCanvasBG />
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 22, height: 220 }}>
                    {CANDIDATE_HEIGHTS.map((h, i) => {
                        const s = spring({
                            frame: localFrame - 10 - i * 6,
                            fps,
                            config: { damping: 14, stiffness: 120, mass: 0.7 },
                        });
                        const height = interpolate(s, [0, 1], [0, h]);
                        return (
                            <div
                                key={i}
                                style={{
                                    width: 46,
                                    height,
                                    borderRadius: 8,
                                    background: i === WINNER_INDEX ? "#111111" : "rgba(17,17,17,0.35)",
                                }}
                            />
                        );
                    })}
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

/* ============================================================
 * Stage 6 — Selection: the winning bar grows and glows, the rest
 * fade away, and a looping arrow signals the cycle repeats
 * (autoregressive generation — this token becomes the next input)
 * ============================================================ */
export const SelectionStage: React.FC<{ sceneFrame?: number }> = ({ sceneFrame = 0 }) => {
    const frame = useCurrentFrame();
    const localFrame = frame - sceneFrame;
    const { fps } = useVideoConfig();

    const collapse = spring({ frame: localFrame, fps, config: { damping: 16, stiffness: 90 } });
    const winnerGrow = spring({ frame: localFrame - 6, fps, config: { damping: 12, stiffness: 130 } });
    const winnerHeight = interpolate(winnerGrow, [0, 1], [140, 260]);
    const glow = interpolate(winnerGrow, [0, 1], [0, 1]);

    const loopSpring = spring({ frame: localFrame - 30, fps, config: { damping: 18, stiffness: 90 } });

    return (
        <AbsoluteFill>
            <MinimalCanvasBG />
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 70 }}>
                    <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 22, height: 280 }}>
                        {CANDIDATE_HEIGHTS.map((h, i) => {
                            const isWinner = i === WINNER_INDEX;
                            const fadeOpacity = isWinner ? 1 : interpolate(collapse, [0, 1], [1, 0]);
                            const height = isWinner ? winnerHeight : h * interpolate(collapse, [0, 1], [1, 0.15]);
                            return (
                                <div
                                    key={i}
                                    style={{
                                        position: "relative",
                                        width: 46,
                                        height,
                                        borderRadius: 8,
                                        background: "#111111",
                                        opacity: fadeOpacity,
                                        boxShadow: isWinner ? `0 0 ${40 * glow}px ${14 * glow}px rgba(17,17,17,${0.35 * glow})` : "none",
                                    }}
                                />
                            );
                        })}
                    </div>

                    {/* curved loop arrow: this selection feeds back in as the next token */}
                    <svg width={220} height={100} viewBox="0 0 220 100" style={{ opacity: loopSpring }}>
                        <path
                            d="M 20 20 C 20 90, 200 90, 200 20"
                            fill="none"
                            stroke="#111111"
                            strokeWidth={6}
                            strokeLinecap="round"
                            strokeDasharray={300}
                            strokeDashoffset={300 * (1 - loopSpring)}
                        />
                        <polygon points="200,10 216,20 200,30" fill="#111111" opacity={loopSpring} />
                    </svg>
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

/* ============================================================
 * Full composition — one canvas, one camera, six stages
 * ============================================================ */
export const LLMThinkingComposition: React.FC = () => {
    // Six stops, alternating pan direction (right, down, left, down,
    // diagonal) so the camera move never repeats the same direction twice
    // in a row. Zoom tightens on the final Selection stage for emphasis.
    const cameraKeyframes: CameraKeyframe[] = [
        { frame: 0, x: 0, y: 0, zoom: 1.0 }, // Stage 1: Tokenize
        { frame: 70, x: 0, y: 0, zoom: 1.0 },
        { frame: 95, x: 1300, y: 0, zoom: 0.92 }, // pan RIGHT -> Stage 2: Embedding
        { frame: 165, x: 1300, y: 0, zoom: 0.92 },
        { frame: 190, x: 1300, y: 2150, zoom: 0.88 }, // pan DOWN -> Stage 3: Attention
        { frame: 260, x: 1300, y: 2150, zoom: 0.88 },
        { frame: 285, x: 0, y: 2150, zoom: 1.05 }, // pan LEFT -> Stage 4: Layers
        { frame: 355, x: 0, y: 2150, zoom: 1.05 },
        { frame: 380, x: 0, y: 4300, zoom: 0.95 }, // pan DOWN -> Stage 5: Prediction
        { frame: 450, x: 0, y: 4300, zoom: 0.95 },
        { frame: 475, x: 1300, y: 3600, zoom: 1.25 }, // pan DIAGONAL (up-right) + zoom in -> Stage 6: Selection
        { frame: 600, x: 1300, y: 3600, zoom: 1.25 },
    ];

    // sceneFrame for each stage = the frame its incoming pan STARTS, taken
    // straight from the keyframes above, so every stage's reveal is locked
    // to the camera's arrival — never plays before the camera gets there.
    return (
        <CanvasViewport cameraKeyframes={cameraKeyframes}>
            {/* Stage 1 Tokenize — chips fracture: impact snap + soft pop */}
            <Sfx file="whip.wav" atFrame={0} volume={0.5} />
            <Sfx file="ding.wav" atFrame={22} volume={0.4} />
            <CanvasNode x={0} y={0} width={NODE_W} height={NODE_H}>
                <TokenizeStage sceneFrame={0} />
            </CanvasNode>

            {/* Stage 2 Embedding — dots scatter onto space: swoosh */}
            <Sfx file="whoosh.wav" atFrame={70} volume={0.5} />
            <CanvasNode x={1300} y={0} width={NODE_W} height={NODE_H}>
                <EmbeddingStage sceneFrame={70} />
            </CanvasNode>

            {/* Stage 3 Attention — links draw themselves: page-turn */}
            <Sfx file="page-turn.wav" atFrame={165} volume={0.5} />
            <Sfx file="ding.wav" atFrame={175} volume={0.35} />
            <CanvasNode x={1300} y={2150} width={NODE_W} height={NODE_H}>
                <AttentionStage sceneFrame={165} />
            </CanvasNode>

            {/* Stage 4 Layers — pulse climbs: swoosh */}
            <Sfx file="whoosh.wav" atFrame={260} volume={0.45} />
            <CanvasNode x={0} y={2150} width={NODE_W} height={NODE_H}>
                <LayersStage sceneFrame={260} />
            </CanvasNode>

            {/* Stage 5 Prediction — bars rise: impact + mount pop */}
            <Sfx file="whip.wav" atFrame={355} volume={0.5} />
            <Sfx file="ding.wav" atFrame={368} volume={0.4} />
            <CanvasNode x={0} y={4300} width={NODE_W} height={NODE_H}>
                <PredictionStage sceneFrame={355} />
            </CanvasNode>

            {/* Stage 6 Selection — winner grows + loop: notification + settle */}
            <Sfx file="ding.wav" atFrame={450} volume={0.5} />
            <Sfx file="whip.wav" atFrame={456} volume={0.45} />
            <CanvasNode x={1300} y={3600} width={NODE_W} height={NODE_H}>
                <SelectionStage sceneFrame={450} />
            </CanvasNode>
        </CanvasViewport>
    );
};