import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
    await authenticate.public.appProxy(request);

    // Get productId from URL
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const page = parseInt(url.searchParams.get("page")) || 1;
    const limit = parseInt(url.searchParams.get("limit")) || 3;

    if (!productId) {
        return json({ reviews: [], stats: null, pagination: null });
    }

    try {
        // Count total approved reviews for pagination
        const totalReviewsCount = await prisma.review.count({
            where: {
                productId,
                approved: true,
            }
        });

        const totalPages = Math.ceil(totalReviewsCount / limit);
        const skip = (page - 1) * limit;

        // Fetch approved reviews with photos (paginated)
        const reviews = await prisma.review.findMany({
            where: {
                productId,
                approved: true,
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
            select: {
                id: true,
                rating: true,
                comment: true,
                username: true,
                photos: true,
                createdAt: true,
                reply: true,
                replyAt: true
            }
        });

        // Calculate aggregate stats for summary bar
        const allReviews = await prisma.review.findMany({
            where: {
                productId,
                approved: true,
            },
            select: {
                rating: true
            }
        });

        const totalReviews = allReviews.length;
        const averageRating = totalReviews > 0
            ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
            : "0.0";

        // Rating distribution
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        allReviews.forEach(r => {
            distribution[r.rating] = (distribution[r.rating] || 0) + 1;
        });

        // Map backend 'username' to frontend 'customerName'
        const mappedReviews = reviews.map(r => ({
            ...r,
            customerName: r.username
        }));

        return json({
            reviews: mappedReviews,
            stats: {
                totalReviews,
                averageRating: parseFloat(averageRating),
                distribution
            },
            pagination: {
                currentPage: page,
                totalPages,
                limit,
                totalReviews: totalReviewsCount
            }
        });
    } catch (error) {
        console.error("Error fetching reviews:", error);
        return json({ reviews: [], stats: null });
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

    const { productId, rating, comment, customerName, email, photos } = data;

    if (!productId || !rating || !comment || !email) {
        return json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
        // Parse photos array (should be array of base64 strings)
        let photoArray = [];
        if (photos && Array.isArray(photos)) {
            // Limit to 5 photos max, each max 2MB (base64 is ~1.37x larger)
            photoArray = photos.slice(0, 5).filter(p =>
                typeof p === 'string' &&
                p.startsWith('data:image/') &&
                p.length < 2.8 * 1024 * 1024 // ~2MB file
            );
        }

        const review = await prisma.review.create({
            data: {
                productId,
                rating: parseInt(rating),
                comment,
                username: customerName || "Anonymous",
                userEmail: email,
                photos: photoArray,
                approved: false
            }
        });

        return json({ success: true, message: "Review submitted for approval" });
    } catch (error) {
        console.error("Error creating review:", error);
        return json({ error: "Failed to submit review" }, { status: 500 });
    }
}

