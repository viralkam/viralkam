import React from "react";
import { Eye, ThumbsUp } from "lucide-react";
import { cleanDisplayTitle, FALLBACK_THUMBNAIL } from "../utils/format";

export default function VideoCard({ video, onSelectVideo }) {
  const formatViews = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(0) + "K";
    return num;
  };

  const displayTitle = cleanDisplayTitle(video.title);

  return (
    <div className="video-block" onClick={() => onSelectVideo(video)}>
      <div className="thumb-container">
        <img 
          src={video.thumbnail || FALLBACK_THUMBNAIL} 
          alt={displayTitle} 
          className="video-thumb-img"
          loading="lazy" 
          onError={(e) => { e.currentTarget.src = FALLBACK_THUMBNAIL; }}
        />
      </div>

      <div className="video-card-infos">
        <h3 className="video-card-title" title={displayTitle}>
          {displayTitle}
        </h3>

        <div className="video-datas">
          <span className="views-number" title={`${video.views || 0} views`}>
            <Eye size={12} className="meta-icon" />
            {video.views ? formatViews(video.views) : "0"}
          </span>

          <span className="rating-score" title={`${video.likes || 0} likes`}>
            <ThumbsUp size={12} className="meta-icon" />
            {video.likes !== undefined && video.likes !== null ? formatViews(video.likes) : "0"}
          </span>

          {video.duration && <span className="data-duration">{video.duration}</span>}
        </div>
      </div>
    </div>
  );
}
