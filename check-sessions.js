import prisma from "./app/db.server.js";

async function checkSessions() {
  try {
    console.log("Checking for Session collection...");
    
    // Try to count sessions
    const sessionCount = await prisma.session.count();
    console.log(`✅ Found ${sessionCount} session(s) in the database`);
    
    // Get all sessions
    const sessions = await prisma.session.findMany();
    console.log("\nSessions:");
    sessions.forEach((session, index) => {
      console.log(`\n${index + 1}. Session ID: ${session.id}`);
      console.log(`   Shop: ${session.shop}`);
      console.log(`   IsOnline: ${session.isOnline}`);
      console.log(`   Expires: ${session.expires}`);
      console.log(`   Access Token: ${session.accessToken ? '***exists***' : 'null'}`);
    });
    
  } catch (error) {
    console.error("❌ Error checking sessions:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSessions();
