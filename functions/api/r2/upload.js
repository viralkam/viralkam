// Cloudflare Serverless Function: POST /api/r2/upload
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.BUCKET) {
    return Response.json({
      success: false,
      message: 'Cloudflare R2 storage (BUCKET) is not bound. In Cloudflare Pages Settings > Functions > R2 bucket bindings, add "BUCKET" linked to "viralkam-videos".'
    }, { status: 500 });
  }

  try {
    const rawFileName = request.headers.get('X-File-Name') || `upload-${Date.now()}.mp4`;
    const filename = decodeURIComponent(rawFileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const contentType = request.headers.get('Content-Type') || 'video/mp4';
    const fileKey = `videos/${Date.now()}-${filename}`;

    await env.BUCKET.put(fileKey, request.body, {
      httpMetadata: { contentType }
    });

    const cdnDomain = env.CDN_DOMAIN || 'vcdn.viralkam.com';
    const publicUrl = `https://${cdnDomain}/${fileKey}`;

    return Response.json({
      success: true,
      key: fileKey,
      url: publicUrl,
      message: 'Video file uploaded successfully to Cloudflare R2'
    }, { status: 201 });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
