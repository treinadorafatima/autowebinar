import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);

async function checkVideos() {
  console.log("📹 Vídeos no banco de dados:\n");
  
  const videos = await sql`SELECT id, uploaded_video_id, filename, title, uploaded_at FROM uploaded_videos ORDER BY uploaded_at DESC`;
  
  if (videos.length === 0) {
    console.log("Nenhum vídeo encontrado no banco.");
  } else {
    for (const v of videos) {
      console.log(`ID: ${v.id}`);
      console.log(`uploadedVideoId: ${v.uploaded_video_id}`);
      console.log(`filename: ${v.filename}`);
      console.log(`title: ${v.title || '(sem título)'}`);
      console.log(`uploaded_at: ${v.uploaded_at}`);
      console.log("---");
    }
  }
  
  await sql.end();
}

checkVideos().catch(console.error);
