import { Composition } from "remotion";
import { LLMThinkingComposition, LLM_THINKING_DURATION_IN_FRAMES } from "./Scenes";

const FPS = 60;
const WIDTH = 1080;
const HEIGHT = 1920;

export const MyComposition = () => {
    return (
        <Composition
            id="StyledSample"
            component={LLMThinkingComposition}
            durationInFrames={LLM_THINKING_DURATION_IN_FRAMES}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
            defaultProps={{}}
        />
    );
};
