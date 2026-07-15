// Resolves a pasted video URL to either a direct playable file (rendered via <video>) or
// a YouTube/Vimeo share link (rendered via an <iframe> embed, since those hosts don't serve
// a raw video file the <video> tag can play).
export interface VideoEmbedInfo {
  type: 'iframe' | 'direct';
  src: string;
}

export function resolveVideoEmbed(url: string, opts?: { autoplay?: boolean; controls?: boolean }): VideoEmbedInfo {
  // Autoplaying video (element or background) must be muted/looped — browsers block
  // unmuted autoplay, and this is what makes it "just play" without the user hitting play.
  const autoplay = !!opts?.autoplay;
  const controls = opts?.controls !== false;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');

    if (host === 'youtube.com' || host === 'youtu.be') {
      let videoId = '';
      if (host === 'youtu.be') videoId = u.pathname.slice(1);
      else if (u.pathname.startsWith('/embed/')) videoId = u.pathname.split('/embed/')[1] || '';
      else videoId = u.searchParams.get('v') || '';
      videoId = videoId.split('/')[0].split('?')[0];
      if (videoId) {
        const params = new URLSearchParams({
          autoplay: autoplay ? '1' : '0',
          mute: autoplay ? '1' : '0',
          loop: autoplay ? '1' : '0',
          controls: controls ? '1' : '0',
          playsinline: '1',
        });
        if (autoplay) params.set('playlist', videoId); // required by YouTube for loop=1 to work
        return { type: 'iframe', src: `https://www.youtube.com/embed/${videoId}?${params.toString()}` };
      }
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const videoId = u.pathname.split('/').filter(Boolean).pop() || '';
      if (videoId && /^\d+$/.test(videoId)) {
        const params = new URLSearchParams({
          autoplay: autoplay ? '1' : '0',
          muted: autoplay ? '1' : '0',
          loop: autoplay ? '1' : '0',
          background: (autoplay && !controls) ? '1' : '0',
        });
        return { type: 'iframe', src: `https://player.vimeo.com/video/${videoId}?${params.toString()}` };
      }
    }
  } catch {
    // Not a valid absolute URL — treat as a direct file path/URL below.
  }
  return { type: 'direct', src: url };
}
