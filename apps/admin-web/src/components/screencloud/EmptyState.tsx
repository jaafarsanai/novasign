import React from "react";
import { HeroCards } from "./HeroCards";
import { TutorialCard } from "./TutorialCard";

export const EmptyState: React.FC<{
  onPair: () => void;
  onLaunch: () => void;
  launching: boolean;
}> = ({ onPair, onLaunch, launching }) => {
  return (
    <div className="sc-empty-state">
      <h1 className="page-title">Screens</h1>
      <p className="page-subtitle">Okay, let’s get a screen up and running.</p>

      <HeroCards onPair={onPair} onLaunch={onLaunch} launching={launching} />

      <div className="sc-video-section">
        <TutorialCard />
      </div>
    </div>
  );
};

