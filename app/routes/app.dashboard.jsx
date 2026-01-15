import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    InlineGrid,
    IndexTable,
    useIndexResourceState,
    Badge,
    Button,
    Pagination,
    EmptyState,
    ProgressBar,
    Box,
    Divider,
    Modal,
    TextField,
    FormLayout,
    InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useLoaderData, useSubmit, useNavigate, Link } from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export const loader = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page")) || 1;
    const take = 20;
    const skip = (page - 1) * take;

    // 1. Basic Stats
    const totalReviews = await prisma.review.count();
    const approvedReviews = await prisma.review.count({
        where: { approved: true },
    });
    const pendingReviews = await prisma.review.count({
        where: { approved: false },
    });

    // Response Rate Calculation
    const repliedReviews = await prisma.review.count({
        where: { NOT: { reply: null } }
    });
    const responseRate = totalReviews > 0 ? Math.round((repliedReviews / totalReviews) * 100) : 0;

    const aggregateRating = await prisma.review.aggregate({
        _avg: {
            rating: true,
        },
    });
    const averageRating = aggregateRating._avg.rating
        ? aggregateRating._avg.rating.toFixed(1)
        : "0.0";

    // 2. Rating Distribution
    const ratingGroups = await prisma.review.groupBy({
        by: ['rating'],
        _count: {
            rating: true,
        },
    });

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingGroups.forEach(group => {
        distribution[group.rating] = group._count.rating;
    });

    // 3. Top Products
    const topProductGroups = await prisma.review.groupBy({
        by: ['productId'],
        _count: {
            productId: true,
        },
        orderBy: {
            _count: {
                productId: 'desc',
            },
        },
        take: 5,
    });

    // 4. Reviews Over Time (Last 30 Days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const recentReviewsDates = await prisma.review.findMany({
        where: {
            createdAt: {
                gte: thirtyDaysAgo
            }
        },
        select: {
            createdAt: true
        }
    });

    const dateCounts = {};
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dateCounts[dateStr] = 0;
    }

    recentReviewsDates.forEach(r => {
        const dateStr = r.createdAt.toISOString().split('T')[0];
        if (dateCounts[dateStr] !== undefined) {
            dateCounts[dateStr]++;
        }
    });

    const reviewsOverTime = Object.keys(dateCounts).sort().map(date => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: dateCounts[date]
    }));

    // 5. Recent Reviews (Paginated)
    const reviews = await prisma.review.findMany({
        orderBy: { createdAt: "desc" },
        take: take,
        skip: skip,
    });

    // 6. Fetch Product Titles
    const reviewProductIds = reviews.map(r => r.productId);
    const topProductIds = topProductGroups.map(g => g.productId);
    const allProductIds = [...new Set([...reviewProductIds, ...topProductIds])].map(id => {
        if (id && !id.startsWith("gid://")) {
            return `gid://shopify/Product/${id}`;
        }
        return id;
    }).filter(id => id);

    let productMap = {};

    if (allProductIds.length > 0) {
        const response = await admin.graphql(
            `#graphql
      query getProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            featuredImage {
                url
            }
          }
        }
      }`,
            {
                variables: {
                    ids: allProductIds,
                },
            },
        );

        const {
            data: { nodes },
        } = await response.json();

        productMap = nodes.reduce((acc, node) => {
            if (node) {
                acc[node.id] = { title: node.title, image: node.featuredImage?.url };
            }
            return acc;
        }, {});
    }

    const getProductDetails = (id) => {
        const gid = id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
        return productMap[gid] || { title: "Unknown Product", image: null };
    };

    const serializedReviews = reviews.map((review) => {
        const details = getProductDetails(review.productId);
        return {
            ...review,
            productTitle: details.title,
            createdAt: review.createdAt.toISOString(),
            updatedAt: review.updatedAt.toISOString(),
        }
    });

    const serializedTopProducts = topProductGroups.map(group => {
        const details = getProductDetails(group.productId);
        return {
            productId: group.productId,
            count: group._count.productId,
            title: details.title,
            image: details.image
        };
    });

    const hasNextPage = (skip + reviews.length) < totalReviews;
    const hasPreviousPage = page > 1;

    return {
        stats: [
            { label: "Total Reviews", value: totalReviews.toString() },
            { label: "Average Rating", value: averageRating.toString() },
            { label: "Pending Reviews", value: pendingReviews.toString() },
        ],
        distribution,
        topProducts: serializedTopProducts,
        reviewsOverTime,
        responseRate,
        reviews: serializedReviews,
        pagination: {
            page,
            hasNextPage,
            hasPreviousPage,
        }
    };
};

export const action = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get("action");
    const reviewId = formData.get("reviewId");

    if (actionType === "approve" && reviewId) {
        await prisma.review.update({
            where: { id: reviewId },
            data: { approved: true },
        });
    } else if (actionType === "delete" && reviewId) {
        await prisma.review.delete({
            where: { id: reviewId },
        })
    } else if (actionType === "reply") {
        const replyText = formData.get("replyText");
        await prisma.review.update({
            where: { id: reviewId },
            data: {
                reply: replyText,
                replyAt: new Date(),
            },
        });
        return { success: true };
    }

    return null;
};

export default function Dashboard() {
    const { stats, distribution, topProducts, reviewsOverTime, responseRate, reviews, pagination } = useLoaderData();
    const submit = useSubmit();
    const navigate = useNavigate();
    const [mounted, setMounted] = useState(false);

    // Reply Modal State
    const [isReplyModalOpen, setReplyModalOpen] = useState(false);
    const [currentReview, setCurrentReview] = useState(null);
    const [replyText, setReplyText] = useState("");

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleApprove = (id) => {
        submit({ action: "approve", reviewId: id }, { method: "post" });
    };

    const handleDelete = (id) => {
        if (confirm("Are you sure you want to delete this review?")) {
            submit({ action: "delete", reviewId: id }, { method: "post" });
        }
    }

    const openReplyModal = (review) => {
        setCurrentReview(review);
        setReplyText(review.reply || "");
        setReplyModalOpen(true);
    };

    const handleReplySubmit = () => {
        submit(
            { action: "reply", reviewId: currentReview.id, replyText: replyText },
            { method: "post" }
        );
        setReplyModalOpen(false);
    };

    const resourceName = {
        singular: "review",
        plural: "reviews",
    };

    const { selectedResources, allResourcesSelected, handleSelectionChange } =
        useIndexResourceState(reviews);

    const rowMarkup = reviews.map(
        (review, index) => (
            <IndexTable.Row
                id={review.id}
                key={review.id}
                selected={selectedResources.includes(review.id)}
                position={index}
            >
                <IndexTable.Cell>
                    <div style={{ minWidth: "160px", maxWidth: "200px" }}>
                        <Text variant="bodyMd" fontWeight="bold" truncate as="span">
                            {review.productTitle}
                        </Text>
                    </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <div style={{ minWidth: "80px" }}>
                        <Text as="span" variant="bodyMd">{(review.rating || 0)} ★</Text>
                    </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <div style={{ maxWidth: "300px", minWidth: "200px" }}>
                        <Text as="p" truncate>{review.comment}</Text>
                    </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <div style={{ minWidth: "170px" }}>
                        <BlockStack gap="0">
                            <Text variant="bodyMd" fontWeight="semibold" truncate>{review.username}</Text>
                            <Text variant="bodySm" tone="subdued" truncate>{review.userEmail}</Text>
                        </BlockStack>
                    </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <div style={{ minWidth: "140px" }}>
                        <BlockStack gap="0">
                            <Text as="span" variant="bodyMd">{new Date(review.createdAt).toLocaleDateString()}</Text>
                            {review.approved ? (
                                <Badge tone="success" size="small">Approved</Badge>
                            ) : (
                                <Badge tone="warning" size="small">Pending</Badge>
                            )}
                        </BlockStack>
                    </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <div style={{ minWidth: "180px" }}>
                        <InlineStack gap="200" wrap={false}>
                            <Button size="slim" onClick={() => openReplyModal(review)}>
                                {review.reply ? "Edit" : "Reply"}
                            </Button>
                            {!review.approved && (
                                <Button size="slim" variant="primary" onClick={() => handleApprove(review.id)}>Approve</Button>
                            )}
                            <Button size="slim" tone="critical" onClick={() => handleDelete(review.id)}>Del</Button>
                        </InlineStack>
                    </div>
                </IndexTable.Cell>
            </IndexTable.Row>
        ),
    );

    const totalForDist = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;

    // Custom "Circular Progress" using SVG for Response Rate
    const radius = 30;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (responseRate / 100) * circumference;
    const strokeColor = responseRate >= 80 ? "#108043" : responseRate >= 50 ? "#E4A300" : "#D72C0D";

    return (
        <Page fullWidth>

            <TitleBar title="Reviews Admin Dashboard" />

            <Modal
                open={isReplyModalOpen}
                onClose={() => setReplyModalOpen(false)}
                title={currentReview ? `Reply to ${currentReview.username}` : "Reply to Review"}
                primaryAction={{
                    content: 'Save Reply',
                    onAction: handleReplySubmit,
                }}
                secondaryActions={[
                    {
                        content: 'Cancel',
                        onAction: () => setReplyModalOpen(false),
                    },
                ]}
            >
                <Modal.Section>
                    <FormLayout>
                        <Text variant="bodyMd" tone="subdued">Review: "{currentReview?.comment}"</Text>
                        <TextField
                            label="Your Reply"
                            value={replyText}
                            onChange={(value) => setReplyText(value)}
                            multiline={4}
                            autoComplete="off"
                            placeholder="Write your response to the customer..."
                        />
                    </FormLayout>
                </Modal.Section>
            </Modal>

            <BlockStack gap="600">

                {/* 1. Key Metrics Cards */}
                <Layout>
                    <Layout.Section>
                        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
                            {stats.map((stat, index) => (
                                <Card key={index}>
                                    <BlockStack gap="200">
                                        <Text as="h3" variant="headingSm" tone="subdued">
                                            {stat.label}
                                        </Text>
                                        <Text as="p" variant="heading2xl">
                                            {stat.value}
                                        </Text>
                                    </BlockStack>
                                </Card>
                            ))}
                            {/* Response Rate Card */}
                            <Card>
                                <InlineGrid columns="auto 1fr" gap="400" alignItems="center">
                                    <div style={{ position: "relative", width: "70px", height: "70px" }}>
                                        <svg width="70" height="70" viewBox="0 0 70 70">
                                            <circle cx="35" cy="35" r={radius} stroke="#e1e3e5" strokeWidth="6" fill="none" />
                                            <circle cx="35" cy="35" r={radius} stroke={strokeColor} strokeWidth="6" fill="none"
                                                strokeDasharray={circumference}
                                                strokeDashoffset={offset}
                                                strokeLinecap="round"
                                                transform="rotate(-90 35 35)"
                                            />
                                            <text x="50%" y="54%" textAnchor="middle" fontSize="14" fill="#333" fontWeight="bold">{responseRate}%</text>
                                        </svg>
                                    </div>
                                    <BlockStack gap="200">
                                        <Text as="h3" variant="headingSm" tone="subdued">Response Rate</Text>
                                        <Text as="p" variant="bodySm" tone="subdued">Target: 80%</Text>
                                    </BlockStack>
                                </InlineGrid>
                            </Card>
                        </InlineGrid>
                    </Layout.Section>
                </Layout>

                {/* 2. Charts (Reviews Growth + Distribution) */}
                <Layout>
                    <Layout.Section variant="twoThirds">
                        <Card>
                            <BlockStack gap="400">
                                <Text as="h2" variant="headingMd">Reviews Growth (30 Days)</Text>
                                <div style={{ height: "300px", width: "100%" }}>
                                    {mounted ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={reviewsOverTime}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#666' }} minTickGap={30} />
                                                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#666' }} allowDecimals={false} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                                    cursor={{ stroke: '#ddd', strokeWidth: 1 }}
                                                />
                                                <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                            <Text tone="subdued">Loading chart...</Text>
                                        </div>
                                    )}
                                </div>
                            </BlockStack>
                        </Card>
                    </Layout.Section>

                    <Layout.Section variant="oneThird">
                        <BlockStack gap="400">
                            {/* Distribution */}
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h2" variant="headingMd">Rating Distribution</Text>
                                    <BlockStack gap="300">
                                        {[5, 4, 3, 2, 1].map(stars => {
                                            const count = distribution[stars];
                                            const percent = (count / totalForDist) * 100;
                                            return (
                                                <div key={stars}>
                                                    <InlineGrid columns="auto 1fr auto" gap="300" alignItems="center">
                                                        <Text tone="subdued" width="40px">{stars} ★</Text>
                                                        <ProgressBar progress={percent} size="small" tone={stars >= 4 ? "success" : stars === 3 ? "highlight" : "critical"} />
                                                        <Text tone="subdued" width="30px">{count}</Text>
                                                    </InlineGrid>
                                                </div>
                                            );
                                        })}
                                    </BlockStack>
                                </BlockStack>
                            </Card>

                            {/* Top Products */}
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h2" variant="headingMd">Top Products</Text>
                                    <BlockStack gap="300">
                                        {topProducts.length > 0 ? (
                                            topProducts.map((prod, idx) => (
                                                <div key={idx}>
                                                    <InlineGrid columns="1fr auto" gap="200" alignItems="center">
                                                        <Text variant="bodyMd" fontWeight="semibold" truncate>
                                                            {prod.title}
                                                        </Text>
                                                        <Badge>{prod.count} reviews</Badge>
                                                    </InlineGrid>
                                                </div>
                                            ))
                                        ) : (
                                            <Text tone="subdued">No data yet.</Text>
                                        )}
                                    </BlockStack>
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    </Layout.Section>
                </Layout>

                {/* 3. Recent Reviews Table */}
                <Layout>
                    <Layout.Section>
                        <Card padding="0">
                            {reviews.length === 0 && pagination.page === 1 ? (
                                <EmptyState
                                    heading="No reviews yet"
                                    action={{ content: "View Products (Storefront)", url: "https://shopify.com", external: true }}
                                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                >
                                    <p>Once customers submit reviews, they will appear here.</p>
                                </EmptyState>
                            ) : (
                                <BlockStack gap="400">
                                    <div style={{ padding: "16px 16px 0 16px" }}>
                                        <Text as="h2" variant="headingMd">
                                            Reviews
                                        </Text>
                                    </div>
                                    <div style={{ width: '100%', overflowX: 'auto' }}>
                                        <IndexTable
                                            resourceName={resourceName}
                                            itemCount={reviews.length}
                                            selectedItemsCount={
                                                allResourcesSelected ? "All" : selectedResources.length
                                            }
                                            onSelectionChange={handleSelectionChange}
                                            headings={[
                                                { title: "Product Name" },
                                                { title: "Rating & Review" },
                                                { title: "Customer Info" },
                                                { title: "Date & Status" },
                                                { title: "Actions" },
                                            ]}
                                        >
                                            {reviews.map((review, index) => (
                                                <IndexTable.Row
                                                    id={review.id}
                                                    key={review.id}
                                                    selected={selectedResources.includes(review.id)}
                                                    position={index}
                                                >
                                                    <IndexTable.Cell>
                                                        <div style={{ maxWidth: "200px", width: "100%", textAlign: "left" }}>
                                                            <Text variant="bodyMd" fontWeight="bold" truncate as="span">
                                                                {review.productTitle}
                                                            </Text>
                                                        </div>
                                                    </IndexTable.Cell>
                                                    <IndexTable.Cell>
                                                        <div style={{ maxWidth: "300px" }}>
                                                            <BlockStack gap="100">
                                                                <Text as="span" variant="bodyMd" fontWeight="bold">{(review.rating || 0)} ★</Text>
                                                                <Link to={`/app/review/${review.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                                                                    <BlockStack gap="050">
                                                                        <Text as="p" truncate>{review.comment}</Text>
                                                                        <Text as="span" variant="bodySm" tone="critical" style={{ textDecoration: "underline" }}>
                                                                            View & Reply &rarr;
                                                                        </Text>
                                                                    </BlockStack>
                                                                </Link>
                                                            </BlockStack>
                                                        </div>
                                                    </IndexTable.Cell>
                                                    <IndexTable.Cell>
                                                        <div style={{ maxWidth: "180px" }}>
                                                            <BlockStack gap="0">
                                                                <Text variant="bodyMd" fontWeight="semibold" truncate>{review.username}</Text>
                                                                <Text variant="bodySm" tone="subdued" truncate>{review.userEmail}</Text>
                                                            </BlockStack>
                                                        </div>
                                                    </IndexTable.Cell>
                                                    <IndexTable.Cell>
                                                        <div style={{ width: "140px" }}>
                                                            <BlockStack gap="0">
                                                                <Text as="span" variant="bodyMd">{new Date(review.createdAt).toLocaleDateString()}</Text>
                                                                {review.approved ? (
                                                                    <Badge tone="success" size="small">Approved</Badge>
                                                                ) : (
                                                                    <Badge tone="warning" size="small">Pending</Badge>
                                                                )}
                                                            </BlockStack>
                                                        </div>
                                                    </IndexTable.Cell>
                                                    <IndexTable.Cell>
                                                        <div style={{ width: "180px" }}>
                                                            <InlineStack gap="200" wrap={false}>
                                                                <Button size="slim" onClick={() => openReplyModal(review)}>
                                                                    {review.reply ? "Edit" : "Reply"}
                                                                </Button>
                                                                {!review.approved && (
                                                                    <Button size="slim" variant="primary" onClick={() => handleApprove(review.id)}>Approve</Button>
                                                                )}
                                                                <Button size="slim" tone="critical" onClick={() => handleDelete(review.id)}>Del</Button>
                                                            </InlineStack>
                                                        </div>
                                                    </IndexTable.Cell>
                                                </IndexTable.Row>
                                            ))}
                                        </IndexTable>
                                    </div>
                                    <Box padding="400">
                                        <div style={{ display: "flex", justifyContent: "center" }}>
                                            <Pagination
                                                hasPrevious={pagination.hasPreviousPage}
                                                onPrevious={() => { navigate(`?page=${pagination.page - 1}`) }}
                                                hasNext={pagination.hasNextPage}
                                                onNext={() => { navigate(`?page=${pagination.page + 1}`) }}
                                            />
                                        </div>
                                    </Box>
                                </BlockStack>
                            )}
                        </Card>
                    </Layout.Section>
                </Layout>
            </BlockStack>
        </Page>
    );
}
