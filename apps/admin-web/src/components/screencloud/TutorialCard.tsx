import React from "react";

export const TutorialCard: React.FC = () => {
  return (
    <div className="card sc-video-card">
      <div className="sc-video-thumb">
        <img
          src="/assets/tutorial-placeholder.png"
          alt="Video tutorial"
          className="sc-video-image"
        />
      </div>
      <div className="sc-video-content">
        <h3>Learn how to set up your first screen</h3>
        <p>Watch this quick tutorial to learn how pairing works.</p>
      </div>
    </div>
  );
};

