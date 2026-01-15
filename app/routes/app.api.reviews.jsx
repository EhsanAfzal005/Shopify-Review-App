import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
    const { admin } = await authenticate.admin(request);

    try {
        const reviews = await prisma.review.findMany({
            orderBy: { createdAt: "desc" },
        });
        return json({ reviews });
    } catch (error) {
        console.error("Error fetching admin reviews:", error);
        return json({ error: "Failed to fetch reviews" }, { status: 500 });
    }
}

export async function action({ request }) {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get("actionType"); // "delete", "approve", "reply"
    const id = formData.get("id");

    if (!id) {
        return json({ error: "Review ID required" }, { status: 400 });
    }

    try {
        if (actionType === "delete") {
            await prisma.review.delete({ where: { id } });
            return json({ success: true, message: "Review deleted" });
        }

        if (actionType === "approve") {
            const approved = formData.get("approved") === "true";
            const review = await prisma.review.update({
                where: { id },
                data: { approved },
            });
            return json({ success: true, review });
        }

        if (actionType === "reply") {
            const reply = formData.get("reply");
            const review = await prisma.review.update({
                where: { id },
                data: { reply }
            });
            return json({ success: true, review });
        }

        return json({ error: "Invalid action type" }, { status: 400 });
    } catch (error) {
        console.error(`Error performing ${actionType} on review:`, error);
        return json({ error: `Failed to ${actionType} review` }, { status: 500 });
    }
}
