import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

prisma.$connect()
  .then(() => console.log("✅ MongoDB Connected Successfully!"))
  .catch((error) => console.error("❌ MongoDB Connection Failed:", error));

export default prisma;
