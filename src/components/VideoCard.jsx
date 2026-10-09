import React from "react";
import { Eye, ThumbsUp } from "lucide-react";

export default function VideoCard({ video, onSelectVideo }) {
  const formatViews = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(0) + "K";
    return num;
  };

  return (
    <div className="video-block" onClick={() => onSelectVideo(video)}>
      <div className="thumb-container">
        <img 
          src={video.thumbnail} 
          alt={video.title} 
          className="video-thumb-img"
          loading="lazy" 
        />
        <span className="duration-tag">{video.duration}</span>
      </div>

      <div className="video-card-infos">
        <h3 className="video-card-title" title={video.title}>
          {video.title}
        </h3>

        <div className="video-datas">
          <span className="views-number">
            <Eye size={12} className="meta-icon" />
            {video.views ? formatViews(video.views) : "0"}
          </span>

          {video.rating && (
            <span className="rating-score">
              <ThumbsUp size={12} className="meta-icon" />
              {video.rating}%
            </span>
          )}

          <span className="data-duration">{video.duration}</span>
        </div>
      </div>
    </div>
  );
}
