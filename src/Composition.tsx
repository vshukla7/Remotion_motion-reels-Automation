import React from "react";
import { Composition, Sequence, AbsoluteFill } from "remotion";
import {
  AnticipationScene,
  CtaScene,
  HookScene,
  NetworkScene,
  RevealScene,
} from "./Scenes";
import { Keyword } from "./Style";

type Props = {};

const FPS = 60;
const WIDTH = 1080;
const HEIGHT = 1920;

export const MyComposition = () => {
  return (
    <Composition
      id="StyledSample"
      component={SampleVideo}
      durationInFrames={60 * 18}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{}}
    />
  );
};

const SampleVideo: React.FC<Props> = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#F5F5F5",
        translate: "-2.8px 0px",
        color: "#e90f0f",
      }}
      from={-36}
    >
      <Sequence from={-14} durationInFrames={60 * 3}>
        <HookScene
          title="Meet the Agent"
          sub={
            <>
              A new way to <Keyword>automate</Keyword> your workflow
            </>
          }
        />
      </Sequence>
      <Sequence from={60 * 3} durationInFrames={60 * 3}>
        <NetworkScene
          label={
            <>
              Connects across your whole <Keyword>ecosystem</Keyword>
            </>
          }
        />
      </Sequence>
      <Sequence from={60 * 6} durationInFrames={60 * 2}>
        <AnticipationScene text="But wait — here's the secret" />
      </Sequence>
      <Sequence from={60 * 8} durationInFrames={60 * 5}>
        <RevealScene
          title="Everything in one place"
          cards={[
            "Smart Prompts",
            "Auto Render",
            "Team Sync",
            "Cloud Export",
            "Templates",
            "Scheduling",
          ]}
        />
      </Sequence>
      <Sequence from={60 * 13} durationInFrames={60 * 5}>
        <CtaScene
          logo="🚀"
          action={<>Follow for more — start building today</>}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
