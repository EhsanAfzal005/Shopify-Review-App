import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Attempting to connect to MongoDB...");
    await prisma.$connect();
    console.log("✅ Connected successfully!");

    console.log("Creating a test review to force collection creation...");
    const review = await prisma.review.create({
      data: {
        productId: "test-product-123",
        username: "Test User",
        userEmail: "test@example.com",
        rating: 5,
        comment: "This is a test review to verify the DB connection.",
        approved: true,
      },
    });

    console.log("✅ Created test review:", review);
    console.log("Check your MongoDB Compass/Atlas now - the 'Review' collection should exist.");
  } catch (error) {
    console.error("❌ Connection failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
