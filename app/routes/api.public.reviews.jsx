import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
    await authenticate.public.appProxy(request);

    // Get productId from URL
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");

    if (!productId) {
        return json({ reviews: [] });
    }

    try {
        const reviews = await prisma.review.findMany({
            where: {
                productId,
                approved: true, // Only show approved reviews
            },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                rating: true,
                comment: true,
                username: true, // Schema has username
                createdAt: true,
                reply: true,
                replyAt: true
            }
        });

        // Map backend 'username' to frontend 'customerName'
        const mappedReviews = reviews.map(r => ({
            ...r,
            customerName: r.username
        }));

        return json({ reviews: mappedReviews });
    } catch (error) {
        console.error("Error fetching reviews:", error);
        return json({ reviews: [] });
    }
}

export async function action({ request }) {
    await authenticate.public.appProxy(request);

    let data;
    try {
        data = await request.json();
    } catch {
        const formData = await request.formData();
        data = Object.fromEntries(formData);
    }

    const { productId, rating, comment, customerName, email } = data;

    if (!productId || !rating || !comment || !email) {
        return json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
        const review = await prisma.review.create({
            data: {
                productId,
                rating: parseInt(rating),
                comment,
                username: customerName || "Anonymous",
                userEmail: email,
                approved: false
            }
        });

        return json({ success: true, message: "Review submitted for approval" });
    } catch (error) {
        console.error("Error creating review:", error);
        return json({ error: "Failed to submit review" }, { status: 500 });
    }
}
