import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

export class MongoSessionStorage extends PrismaSessionStorage {
  async storeSession(session) {
    // Convert session to simple object
    const data = session.toObject();
    
    // Destructure to separate 'id' from the rest of the fields
    const { id, ...rest } = data;

    // Perform upsert: 
    // - where: match by 'id'
    // - create: use complete 'data' (including 'id')
    // - update: use 'rest' (EXCLUDING 'id') to avoid Prisma error
    await this.prisma.session.upsert({
      where: { id },
      create: data, 
      update: rest,
    });

    return true;
  }
}
