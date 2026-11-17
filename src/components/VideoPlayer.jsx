import React, { useEffect, useRef } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";

export default function VideoPlayer({ options, onReady }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const failoverRef = useRef(false);

  useEffect(() => {
    failoverRef.current = false;
  }, [options.sources]);

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current && videoRef.current) {
      const videoElement = document.createElement("video-js");
      videoElement.classList.add("vjs-big-play-centered", "vjs-fill");
      videoElement.setAttribute("referrerpolicy", "no-referrer");
      videoRef.current.appendChild(videoElement);

      const player = (playerRef.current = videojs(videoElement, {
        preload: options.preload || "none",
        ...options,
        fill: true,
        responsive: true
      }, () => {
        if (onReady) {
          onReady(player);
        }
      }));

      // Automatic failover between URLs if primary stream fails
      player.on("error", () => {
        const sources = options.sources || [];
        if (!failoverRef.current && sources.length > 1) {
          failoverRef.current = true;
          const backupSource = sources[1];
          if (backupSource && backupSource.src) {
            console.warn("[VideoPlayer] Primary URL failed, auto-shifting to backup URL:", backupSource.src);
            player.error(null);
            player.src(backupSource);
            player.load();
            player.play().catch(() => {});
          }
        }
      });
    } else if (playerRef.current) {
      const player = playerRef.current;
      player.autoplay(options.autoplay);
      player.src(options.sources);
      if (options.poster) {
        player.poster(options.poster);
      }
    }
  }, [options, videoRef]);

  // Dispose the player when the functional component unmounts
  useEffect(() => {
    const player = playerRef.current;

    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, [playerRef]);

  return (
    <div data-vjs-player className="video-player-wrapper">
      <div ref={videoRef} />
    </div>
  );
}
