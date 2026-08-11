import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const BG_COLOR = "#F5F5F5";
export const Vignette: React.FC = () => {
	const { width, height } = useVideoConfig();
	return (
		<AbsoluteFill
			style={{
				pointerEvents: "none",
				filter: "blur(120px)",
				opacity: 0.55,
			}}
		>
			<div
				style={{
					position: "absolute",
					top: -height * 0.25,
					left: -width * 0.25,
					width: width * 0.6,
					height: width * 0.6,
					borderRadius: "50%",
					background: "#D8DCE3",
				}}
			/>
			<div
				style={{
					position: "absolute",
					bottom: -height * 0.25,
					right: -width * 0.25,
					width: width * 0.6,
					height: width * 0.6,
					borderRadius: "50%",
					background: "#E3DFD8",
				}}
			/>
		</AbsoluteFill>
	);
};

// Rapid sequential mounting: scale 0.8 -> 1.0, translateY 10px -> 0, snappy spring ease-out.
export const Type: React.FC<{
	text: string;
	delay?: number;
	size?: number;
	weight?: number;
	align?: "left" | "center";
}> = ({ text, delay = 0, size = 64, weight = 600, align = "center" }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const progress = spring({
		frame: frame - delay,
		fps,
		config: { damping: 200, mass: 0.6 },
	});
	const scale = interpolate(progress, [0, 1], [0.8, 1.0]);
	const y = interpolate(progress, [0, 1], [10, 0]);
	const opacity = interpolate(progress, [0, 0.5], [0, 1], {
		extrapolateRight: "clamp",
	});
	return (
		<div
			style={{
				opacity,
				transform: `scale(${scale}) translateY(${y}px)`,
				fontSize: size,
				fontWeight: weight,
				color: "#111111",
				textAlign: align,
				lineHeight: 1.1,
				fontFamily: "Inter, system-ui, sans-serif",
			}}
		>
			{text}
		</div>
	);
};

// Keyword: wrap a keyword in a solid black box with inverse white text.
export const Keyword: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<span
		style={{
			backgroundColor: "#111111",
			color: "#FFFFFF",
			padding: "0.05em 0.25em",
			borderRadius: 6,
		}}
	>
		{children}
	</span>
);
