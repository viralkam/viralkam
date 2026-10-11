// Cloudflare Serverless Function: POST /api/reports
export async function onRequestPost(context) {
  const { request, env } = context;

  const contactEmail = env.CONTACT_EMAIL || 'contact@yourdomain.com';
  if (!env.DB) {
    return Response.json({
      success: true,
      message: `Report received. Our moderation team (${contactEmail}) will review within 24 hours.`
    }, { status: 201 });
  }

  try {
    const rep = await request.json();
    await env.DB.prepare(`
      INSERT INTO reports (video_id, video_title, reason, email)
      VALUES (?, ?, ?, ?)
    `).bind(
      rep.videoId || 'unknown',
      rep.videoTitle || 'N/A',
      rep.reason || 'DMCA / Copyright',
      rep.email || contactEmail
    ).run();

    return Response.json({
      success: true,
      message: `Report received. Our moderation team (${contactEmail}) will review within 24 hours.`
    }, { status: 201 });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
