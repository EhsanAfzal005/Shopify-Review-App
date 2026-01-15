import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const review = await prisma.review.create({
    data: {
      productId: "gid://shopify/Product/1234567890", // Example Product ID
      username: "John Doe",
      userEmail: "john@example.com",
      rating: 5,
      comment: "This is a test review with a reply field!",
      approved: true,
      reply: "Thanks for your review!",
    },
  });
  console.log("Created test review:", review);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
