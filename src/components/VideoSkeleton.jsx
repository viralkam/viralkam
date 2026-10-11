import React from "react";

export function VideoSkeleton() {
  return (
    <div className="video-block skeleton-block" aria-hidden="true">
      <div className="thumb-container skeleton-shimmer">
        <div className="skeleton-duration"></div>
      </div>
      <div className="video-card-infos">
        <div className="skeleton-line skeleton-title-1"></div>
        <div className="skeleton-line skeleton-title-2"></div>
        <div className="video-datas skeleton-meta-row">
          <div className="skeleton-pill"></div>
          <div className="skeleton-pill"></div>
          <div className="skeleton-pill skeleton-pill-right"></div>
        </div>
      </div>
    </div>
  );
}

export function VideoSkeletonGrid({ count = 24 }) {
  return (
    <div className="tube-video-grid">
      {Array.from({ length: count }).map((_, i) => (
        <VideoSkeleton key={`skeleton-${i}`} />
      ))}
    </div>
  );
}
