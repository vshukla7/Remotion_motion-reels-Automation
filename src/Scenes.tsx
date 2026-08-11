import React from "react";
import {
    AbsoluteFill,
    Easing,
    interpolate,
    spring,
    useCurrentFrame,
    useVideoConfig,
    staticFile,
} from "remotion";
import { BG_COLOR, Vignette } from "./Style";

/**
 * ============================================================================
 * WHY THIS FILE IS STRUCTURED THIS WAY (read this before editing)
 * ============================================================================
 * The whole video is ONE canvas. Every scene (CanvasNode) is mounted for the
 * entire duration of the video, positioned at a fixed (x, y) coordinate on
 * that canvas. There is no mounting/unmounting, no cross-fade, no hard cut
 * between scenes — the only thing that moves is the camera (CanvasViewport),
 * which pans/zooms between keyframes.
 *
 * The bug that made it *feel* like separate scene-to-scene animations instead
 * of one continuous camera move was: every scene's internal spring/interpolate
 * calls used the raw global `frame` from useCurrentFrame(). Since ALL scenes
 * share the same timeline, that meant every scene's "intro" animation (text
 * flying in, icons popping in, etc.) played at frame 0 — while the camera was
 * still sitting on scene 1. By the time the camera actually panned over to
 * scene 2, scene 2's intro animation was long finished, so it just "appeared"
 * fully-formed and static, which reads as a jump-cut rather than a reveal.
 *
 * THE FIX: every scene now accepts a `sceneFrame` prop — the global frame at
 * which the camera BEGINS panning toward that scene. Internally each scene
 * computes `localFrame = frame - sceneFrame` and drives all of its animation
 * off that instead of the raw frame. That makes every scene's reveal
 * animation play out WHILE the camera arrives, so it truly feels like the
 * camera is uncovering a single, already-built canvas.
 *
 * DIRECTION CONSISTENCY: each scene also takes `vertical` ("up" | "down")
 * and `side` ("left" | "right" | "none") props for its text. In
 * SpatialCanvasComposition these are derived from the direction the camera
 * just panned in (see the comments there), so a scene the camera pans INTO
 * from the right will have its words slide in from the right too — text
 * motion always agrees with camera motion.
 * ============================================================================
 */

// "First fast, then slow" easing — used for every camera move AND is the
// same spring "feel" (critically damped, high stiffness) reused for word
// entrances so the whole piece has one consistent motion language.
const FAST_THEN_SLOW = Easing.bezier(0.16, 1, 0.3, 1);

// ==========================================
// 2D Spatial Canvas & Camera Controller
// ==========================================
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

    // Find which segment of the camera path we're currently in.
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

    // Every camera move (in ANY direction) uses the same fast->slow curve,
    // so pans feel consistent whether they go left, right, up, down or
    // diagonal — only the x/y/zoom targets differ per move.
    const progress = isTransitioning
        ? interpolate(frame, [startKF.frame, endKF.frame], [0, 1], {
              easing: FAST_THEN_SLOW,
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

// Fixed spatial position for a scene on the canvas. Always mounted — never
// conditionally rendered — so nothing "pops in/out" independently of the
// camera.
export const CanvasNode: React.FC<{
    x: number;
    y: number;
    width?: number;
    height?: number;
    children: React.ReactNode;
}> = ({ x, y, width = 1920, height = 1080, children }) => {
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

// ==========================================
// Word-by-Word Animated Text Component
// ==========================================
// vertical: words rise "up" into place (default) or drop in from "down".
// side: horizontal direction words travel from — "left" means the word
//   starts to the RIGHT of its final spot and slides LEFT into place;
//   "right" means it starts to the LEFT and slides RIGHT into place;
//   "none" = vertical motion only.
// Both axes animate together off the SAME spring, so normal words move on a
// single diagonal path (this replaces the old either/or "slide-up" OR
// "slide-left" modes with a combined up+sideways motion, as requested).
export type SlideVertical = "up" | "down";
export type SlideSide = "left" | "right" | "none";

export const AnimatedText: React.FC<{
    text: React.ReactNode;
    vertical?: SlideVertical;
    side?: SlideSide;
    delay?: number;
    staggerFrames?: number;
    fontSize?: number;
    color?: string;
    style?: React.CSSProperties;
}> = ({
    text = "",
    vertical = "up",
    side = "left",
    delay = 5,
    staggerFrames = 3,
    fontSize = 64,
    color = "#111111",
    style,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const safeText = typeof text === "string" ? text : String(text ?? "");

    // Split into tokens, keeping any **bold phrase** — even a MULTI-WORD one
    // like "**next generation**" — intact as a single highlighted unit. The
    // old version split on spaces first, which broke multi-word bold phrases
    // (only the first word inside "**" got flagged). This regex-split keeps
    // the whole "**...**" run together, then only breaks the *plain* text
    // around it into individual words.
    const tokens = safeText.split(/(\*\*[^*]+\*\*)/g).filter((t) => t.length > 0);

    const words: { text: string; isHighlighted: boolean }[] = [];
    tokens.forEach((tok) => {
        if (tok.startsWith("**") && tok.endsWith("**")) {
            words.push({ text: tok.slice(2, -2), isHighlighted: true });
        } else {
            tok
                .split(" ")
                .filter((w) => w.length > 0)
                .forEach((w) => words.push({ text: w, isHighlighted: false }));
        }
    });

    return (
        <div
            style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
                gap: "0.3em",
                fontSize,
                fontWeight: 700,
                color,
                lineHeight: 1.2,
                ...style,
            }}
        >
            {words.map((item, i) => {
                const wordDelay = delay + i * staggerFrames;
                const wordSpring = spring({
                    frame: frame - wordDelay,
                    fps,
                    config: { damping: 14, stiffness: 100 },
                });

                if (item.isHighlighted) {
                    // Highlighter/wipe effect: a solid pill wipes open from the
                    // CENTER outward, equally to the left and right, rather
                    // than sliding in from one side. inset(0% X% 0% X%) with X
                    // shrinking 50% -> 0% grows the visible area symmetrically
                    // from the middle.
                    const wipeProgress = interpolate(wordSpring, [0, 1], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                    });
                    const insetPercent = 50 * (1 - wipeProgress);

                    return (
                        <span
                            key={i}
                            style={{
                                display: "inline-block",
                                position: "relative",
                                padding: "0.15em 0.35em",
                                borderRadius: "0.2em",
                                backgroundColor: "#111111",
                                color: "#FFFFFF",
                                clipPath: `inset(0% ${insetPercent}% 0% ${insetPercent}%)`,
                                WebkitClipPath: `inset(0% ${insetPercent}% 0% ${insetPercent}%)`,
                            }}
                        >
                            {item.text}
                        </span>
                    );
                }

                const opacity = wordSpring;

                // Diagonal entrance: vertical + horizontal offsets driven by
                // the SAME spring value, so the word travels one smooth
                // diagonal path rather than two separate animation "modes".
                const startY = vertical === "up" ? 40 : -40;
                const startX = side === "none" ? 0 : side === "left" ? 60 : -60;

                const translateY = interpolate(wordSpring, [0, 1], [startY, 0]);
                const translateX = interpolate(wordSpring, [0, 1], [startX, 0]);

                return (
                    <span
                        key={i}
                        style={{
                            display: "inline-block",
                            opacity,
                            transform: `translate(${translateX}px, ${translateY}px)`,
                        }}
                    >
                        {item.text}
                    </span>
                );
            })}
        </div>
    );
};

// ==========================================
// Scene Type A: Hook / Concept Intro
// ==========================================
export const HookScene: React.FC<{
    title: React.ReactNode;
    subText?: React.ReactNode;
    sceneFrame?: number; // global frame the camera begins arriving at this scene
    vertical?: SlideVertical;
    side?: SlideSide;
}> = ({
    title,
    subText = "Sharing files **effortlessly** across all devices",
    sceneFrame = 0,
    vertical = "up",
    side = "none",
}) => {
    const frame = useCurrentFrame();
    const localFrame = frame - sceneFrame;
    const { fps } = useVideoConfig();

    const iconSpring = spring({ frame: localFrame, fps, config: { damping: 10, mass: 0.5, stiffness: 100 } });
    const handLSpring = spring({ frame: localFrame, fps, config: { damping: 12, mass: 0.8 } });
    const handRSpring = spring({ frame: localFrame, fps, config: { damping: 12, mass: 0.8 } });

    const handL = interpolate(handLSpring, [0, 1], [-400, 0]);
    const handR = interpolate(handRSpring, [0, 1], [400, 0]);
    const float = Math.sin(localFrame / 12) * 8;

    return (
        <AbsoluteFill style={{ background: BG_COLOR }}>
            <img
                src={staticFile("backgrounds/1.jpg")}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: `scale(${interpolate(localFrame, [0, 150], [1, 1.08], {
                        extrapolateLeft: "clamp",
                    })})`,
                }}
            />

            <div
                style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <div style={{ position: "absolute", left: "15%", transform: `translateX(${handL}px)`, fontSize: 160 }}>
                    🤲
                </div>
                <div style={{ position: "absolute", right: "15%", transform: `translateX(${handR}px)`, fontSize: 160 }}>
                    🤝
                </div>
                <div
                    style={{
                        fontSize: 200,
                        transform: `scale(${iconSpring}) translateY(${float}px)`,
                        filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.15))",
                    }}
                >
                    📁
                </div>
            </div>

            <div
                style={{
                    position: "absolute",
                    bottom: 180,
                    width: "100%",
                    padding: "0 8%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    alignItems: "center",
                }}
            >
                <AnimatedText text={title} vertical={vertical} side={side} fontSize={88} delay={5} />
                {subText && (
                    <AnimatedText text={subText} vertical={vertical} side={side} fontSize={48} delay={18} color="#333" />
                )}
            </div>
        </AbsoluteFill>
    );
};

// ==========================================
// Scene Type B: Network Scene
// ==========================================
export const NetworkScene: React.FC<{
    label: React.ReactNode;
    sceneFrame?: number;
    vertical?: SlideVertical;
    side?: SlideSide;
}> = ({ label = "Connected **ecosystem** for modern teams", sceneFrame = 0, vertical = "up", side = "left" }) => {
    const frame = useCurrentFrame();
    const localFrame = frame - sceneFrame;
    const { fps, width } = useVideoConfig();

    const spin = interpolate(localFrame, [0, 180], [0, Math.PI * 2]);
    const ringScale = spring({ frame: localFrame, fps, config: { damping: 14, stiffness: 80 } });
    const ringSize = Math.min(width, 1080) * 0.75;
    const nodes = ["🔗", "🌐", "👥", "📡", "🧩", "⚙️"];

    return (
        <AbsoluteFill style={{ background: BG_COLOR }}>
            <img
                src={staticFile("backgrounds/2.jpg")}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />

            <div style={{ position: "relative", width: ringSize, height: ringSize, transform: `scale(${ringScale})` }}>
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        border: "32px solid #C9CDD6",
                        transform: `rotate(${spin}rad)`,
                    }}
                />

                {nodes.map((n, i) => {
                    const angle = (i / nodes.length) * Math.PI * 2;
                    const r = ringSize * 0.5;
                    const x = Math.cos(angle) * r;
                    const y = Math.sin(angle) * r;

                    const nodeSpring = spring({ frame: localFrame - i * 3, fps, config: { damping: 12, mass: 0.6 } });

                    return (
                        <div
                            key={i}
                            style={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${nodeSpring})`,
                                fontSize: 64,
                            }}
                        >
                            {n}
                        </div>
                    );
                })}
            </div>

            <div style={{ position: "absolute", bottom: 160, padding: "0 10%", width: "100%" }}>
                <AnimatedText text={label} vertical={vertical} side={side} fontSize={52} delay={12} />
            </div>
        </AbsoluteFill>
    );
};

// ==========================================
// Scene Type C: Anticipation Scene
// ==========================================
export const AnticipationScene: React.FC<{
    text: React.ReactNode;
    sceneFrame?: number;
    vertical?: SlideVertical;
    side?: SlideSide;
}> = ({ text = "Preparing **next-generation** workflow", sceneFrame = 0, vertical = "up", side = "none" }) => {
    const frame = useCurrentFrame();
    const localFrame = frame - sceneFrame;
    const { width } = useVideoConfig();

    const fill = interpolate(localFrame, [0, 75], [0, 1], {
        easing: Easing.bezier(0.25, 1, 0.5, 1),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    return (
        <AbsoluteFill style={{ background: BG_COLOR }}>
            <img
                src={staticFile("backgrounds/3.jpg")}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />

            <div style={{ width: width * 0.6, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: "100%", height: 18, background: "#E0E0E0", borderRadius: 9, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${fill * 100}%`, background: "#111111", borderRadius: 9 }} />
                </div>

                <div style={{ marginTop: 40 }}>
                    <AnimatedText text={text} vertical={vertical} side={side} fontSize={56} delay={5} />
                </div>
            </div>
        </AbsoluteFill>
    );
};

// ==========================================
// Scene Type D: Product Reveal Scene
// ==========================================
export const RevealScene: React.FC<{
    title: React.ReactNode;
    cards: string[];
    sceneFrame?: number;
    vertical?: SlideVertical;
    side?: SlideSide;
}> = ({
    title = "Unlock **unlimited** speed",
    cards = ["⚡ Fast Sync", "🔒 Encrypted", "☁️ Unlimited"],
    sceneFrame = 0,
    vertical = "up",
    side = "right",
}) => {
    const frame = useCurrentFrame();
    const localFrame = frame - sceneFrame;
    const { fps } = useVideoConfig();

    const baseSpring = spring({ frame: localFrame, fps, config: { damping: 16, stiffness: 90, mass: 0.9 } });
    const baseTranslateY = interpolate(baseSpring, [0, 1], [150, 0]);
    const baseScale = interpolate(baseSpring, [0, 1], [0.92, 1]);

    return (
        <AbsoluteFill style={{ background: BG_COLOR }}>
            <img
                src={staticFile("backgrounds/4.jpg")}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />

            <div
                style={{
                    position: "relative",
                    width: "82%",
                    minHeight: 520,
                    padding: "50px 40px",
                    background: "rgba(255, 255, 255, 0.75)",
                    backdropFilter: "blur(30px) saturate(180%)",
                    WebkitBackdropFilter: "blur(30px) saturate(180%)",
                    borderRadius: 44,
                    border: "1px solid rgba(255, 255, 255, 0.8)",
                    boxShadow: "0 40px 80px rgba(0, 0, 0, 0.12)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    transform: `translateY(${baseTranslateY}px) scale(${baseScale})`,
                    opacity: baseSpring,
                }}
            >
                <div style={{ marginBottom: 40 }}>
                    <AnimatedText text={title} vertical={vertical} side={side} fontSize={68} delay={8} />
                </div>

                {/* gridTemplateColumns is now driven by cards.length instead of
                    being hardcoded to 3, so passing 2 or 4+ cards still lines up. */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${cards.length}, 1fr)`,
                        gap: 24,
                        width: "100%",
                    }}
                >
                    {cards.map((c, i) => {
                        const optionSpring = spring({
                            frame: localFrame - 14 - i * 5,
                            fps,
                            config: { damping: 11, stiffness: 130, mass: 0.6 },
                        });

                        const optionScale = interpolate(optionSpring, [0, 1], [0.4, 1]);
                        const optionY = interpolate(optionSpring, [0, 1], [40, 0]);

                        return (
                            <div
                                key={i}
                                style={{
                                    transform: `translateY(${optionY}px) scale(${optionScale})`,
                                    opacity: optionSpring,
                                    height: 180,
                                    background: "#FFFFFF",
                                    borderRadius: 28,
                                    boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 28,
                                    fontWeight: 600,
                                    color: "#111",
                                    padding: 20,
                                    textAlign: "center",
                                }}
                            >
                                {c}
                            </div>
                        );
                    })}
                </div>
            </div>
        </AbsoluteFill>
    );
};

// ==========================================
// Scene Type G: Call To Action
// ==========================================
export const CtaScene: React.FC<{
    logo: string;
    actionText: React.ReactNode;
    sceneFrame?: number;
    vertical?: SlideVertical;
    side?: SlideSide;
}> = ({ logo = "🚀", actionText = "Get started **today** free", sceneFrame = 0, vertical = "down", side = "right" }) => {
    const frame = useCurrentFrame();
    const localFrame = frame - sceneFrame;
    const { fps } = useVideoConfig();

    const logoDrop = spring({ frame: localFrame, fps, config: { damping: 11, mass: 0.8, stiffness: 110 } });

    return (
        <AbsoluteFill style={{ background: BG_COLOR, justifyContent: "center", alignItems: "center" }}>
            <Vignette />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
                <div
                    style={{
                        fontSize: 220,
                        transform: `translateY(${interpolate(logoDrop, [0, 1], [-400, 0])}px) scale(${logoDrop})`,
                        filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.2))",
                    }}
                >
                    {logo}
                </div>

                <AnimatedText text={actionText} vertical={vertical} side={side} fontSize={68} delay={10} />
            </div>
        </AbsoluteFill>
    );
};

// ==========================================
// Example Canvas Composition Container
// ==========================================
export const SpatialCanvasComposition: React.FC = () => {
    // Camera path across the canvas. Each entry's `frame` is when the camera
    // ARRIVES at that x/y/zoom. A pan happens between a "hold" keyframe and
    // the next differing one.
    const cameraKeyframes: CameraKeyframe[] = [
        { frame: 0, x: 0, y: 0, zoom: 1.0 }, // Scene 1: start, centered
        { frame: 60, x: 0, y: 0, zoom: 1.0 }, // Hold on Scene 1
        { frame: 80, x: 2200, y: 0, zoom: 0.95 }, // Pan RIGHT -> Scene 2
        { frame: 140, x: 2200, y: 0, zoom: 0.95 }, // Hold on Scene 2
        { frame: 160, x: 2200, y: 1400, zoom: 0.85 }, // Pan DOWN + zoom out -> Scene 3
        { frame: 220, x: 2200, y: 1400, zoom: 0.85 }, // Hold on Scene 3
        { frame: 240, x: 0, y: 1400, zoom: 1.1 }, // Pan LEFT + zoom in -> Scene 4
        { frame: 300, x: 0, y: 1400, zoom: 1.1 }, // Hold on Scene 4
        { frame: 320, x: -2200, y: 700, zoom: 1.0 }, // Diagonal pan UP-LEFT -> Scene 5
    ];

    // sceneFrame = the frame each pan STARTS (not ends), taken straight from
    // the keyframe array above, so text always begins animating exactly when
    // the camera starts moving toward it and settles right as the camera
    // arrives — text motion and camera motion are locked together.
    //
    // vertical/side are chosen to match the direction the camera just moved:
    // panned right -> content slides in from the right ("left" side, i.e.
    // travelling leftward into place); panned down -> rises up from below;
    // panned left -> slides in from the left; diagonal up-left -> drops in
    // from the upper-right, travelling down-right into place.
    return (
        <CanvasViewport cameraKeyframes={cameraKeyframes}>
            {/* Scene 1 (0,0) — first thing on screen, no incoming pan yet */}
            <CanvasNode x={0} y={0}>
                <HookScene title="Welcome to **Canvas** Mode" sceneFrame={0} vertical="up" side="none" />
            </CanvasNode>

            {/* Scene 2 (2200,0) — camera pans RIGHT to get here (frames 60->80) */}
            <CanvasNode x={2200} y={0}>
                <NetworkScene
                    label="Connected **ecosystem** for modern teams"
                    sceneFrame={60}
                    vertical="up"
                    side="left"
                />
            </CanvasNode>

            {/* Scene 3 (2200,1400) — camera pans DOWN to get here (frames 140->160) */}
            <CanvasNode x={2200} y={1400}>
                <AnticipationScene
                    text="Preparing **next-generation** workflow"
                    sceneFrame={140}
                    vertical="up"
                    side="none"
                />
            </CanvasNode>

            {/* Scene 4 (0,1400) — camera pans LEFT to get here (frames 220->240) */}
            <CanvasNode x={0} y={1400}>
                <RevealScene
                    title="Unlock **unlimited** speed"
                    cards={["⚡ Fast Sync", "🔒 Encrypted", "☁️ Unlimited"]}
                    sceneFrame={220}
                    vertical="up"
                    side="right"
                />
            </CanvasNode>

            {/* Scene 5 (-2200,700) — camera pans diagonally UP-LEFT (frames 300->320) */}
            <CanvasNode x={-2200} y={700}>
                <CtaScene logo="🚀" actionText="Get started **today** free" sceneFrame={300} vertical="down" side="right" />
            </CanvasNode>
        </CanvasViewport>
    );
};