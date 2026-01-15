import { json } from "@remix-run/node";
import prisma from "../db.server";
import { cors } from "remix-utils/cors";

// GET: Fetch reviews for a specific product
export async function loader({ request }) {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");

    if (!productId) {
        return cors(request, json({ error: "Product ID is required" }, { status: 400 }));
    }

    try {
        const reviews = await prisma.review.findMany({
            where: {
                productId: productId,
                approved: true, // Only fetch approved reviews for public
            },
            orderBy: {
                createdAt: "desc",
            },
            select: {
                id: true,
                username: true,
                rating: true,
                comment: true,
                createdAt: true,
                reply: true, // Include reply in the response
            },
        });

        return cors(request, json({ reviews }));
    } catch (error) {
        console.error("Error fetching reviews:", error);
        return cors(request, json({ error: "Failed to fetch reviews" }, { status: 500 }));
    }
}

// POST: Submit a new review
export async function action({ request }) {
    if (request.method !== "POST") {
        return cors(request, json({ error: "Method not allowed" }, { status: 405 }));
    }

    try {
        const body = await request.json();
        const { productId, username, userEmail, rating, comment, orderId } = body;

        // Basic validation
        if (!productId || !username || !userEmail || !rating || !comment) {
            return cors(request, json({ error: "Missing required fields" }, { status: 400 }));
        }

        const review = await prisma.review.create({
            data: {
                productId,
                username,
                userEmail,
                rating: parseInt(rating),
                comment,
                orderId: orderId || null,
                approved: false, // Default to not approved
            },
        });

        return cors(request, json({ success: true, review }, { status: 201 }));
    } catch (error) {
        console.error("Error creating review:", error);
        return cors(request, json({ error: "Failed to create review" }, { status: 500 }));
    }
}

// Handle OPTIONS requests for CORS
export async function options({ request }) {
    return cors(request, json(null, { status: 204 }));
}
