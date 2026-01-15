import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(
        request
    );

    if (!admin) {
        // The admin context isn't returned if the webhook fired after a shop was uninstalled.
        throw new Response();
    }

    // The topics handled here should be declared in the shopify.app.toml.
    // More info: https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration
    switch (topic) {
        case "PRODUCTS_DELETE":
            if (payload?.id) {
                // Shopify sends IDs like 1234567890, but we might have stored them as gid://shopify/Product/1234567890 
                // or just the ID. 
                // Existing test seed used "gid://shopify/Product/1234567890".
                // The payload.id from webhook is a number usually (e.g. 7880321196742).
                // The admin GraphQL API returns GIDs. 

                // If we stored GID, we need to convert.
                // Let's assume we store what we get from the front-end or admin.
                // Ideally, we should standardize on GID.
                // Let's try to delete both versions to be safe, or just constructing the GID if it's a number.

                const id = payload.id;
                const gid = `gid://shopify/Product/${id}`;

                console.log(`Processing PRODUCTS_DELETE for product ${id}`);

                await db.review.deleteMany({
                    where: {
                        OR: [
                            { productId: String(id) },
                            { productId: gid }
                        ]
                    }
                });
            }
            break;
        default:
            throw new Response("Unhandled webhook topic", { status: 404 });
    }

    throw new Response();
};
