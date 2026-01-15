import prisma from "./app/db.server.js";

async function clearSessions() {
  try {
    console.log("Clearing all sessions from MongoDB...");
    
    const result = await prisma.session.deleteMany({});
    console.log(`✅ Deleted ${result.count} session(s)`);
    console.log("\nYou can now restart 'npm run dev' and authenticate fresh.");
    
  } catch (error) {
    console.error("❌ Error clearing sessions:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

clearSessions();
