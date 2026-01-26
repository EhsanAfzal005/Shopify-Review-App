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
    Thumbnail,
    Tooltip as PolarisTooltip, // Alias to avoid conflict with Recharts Tooltip
    Icon,
} from "@shopify/polaris";
import {
    CheckIcon,
    ChatIcon,
    DeleteIcon,
    ProductIcon,
    ImageIcon
} from "@shopify/polaris-icons";
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
            productImage: details.image,
            photos: review.photos || [],
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
                {/* Product Column */}
                <IndexTable.Cell>
                    <InlineStack gap="300" wrap={false} blockAlign="center">
                        <Thumbnail
                            source={review.productImage || ProductIcon}
                            alt={review.productTitle}
                            size="small"
                        />
                        <div style={{ maxWidth: "150px" }}>
                            <Text variant="bodySm" fontWeight="bold" truncate>
                                {review.productTitle}
                            </Text>
                        </div>
                    </InlineStack>
                </IndexTable.Cell>

                {/* Rating & Review Column */}
                <IndexTable.Cell>
                    <BlockStack gap="100">
                        <div style={{ display: 'flex', gap: '1px' }}>
                            {[1, 2, 3, 4, 5].map(star => (
                                <span key={star} style={{ color: star <= review.rating ? '#D32F2F' : '#E0E0E0', fontSize: '14px' }}>★</span>
                            ))}
                        </div>
                        <div style={{ maxWidth: "250px" }}>
                            <Text as="p" variant="bodyMd" truncate>
                                {review.comment}
                            </Text>
                            {review.reply && (
                                <Text as="span" variant="bodyXs" tone="subdued">
                                    ↩ Replied
                                </Text>
                            )}
                        </div>
                    </BlockStack>
                </IndexTable.Cell>

                {/* Customer Column */}
                <IndexTable.Cell>
                    <InlineStack gap="300" wrap={false} blockAlign="center">
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            backgroundColor: '#FFEBEE', color: '#D32F2F',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: 'bold', border: '1px solid #FFCDD2'
                        }}>
                            {(review.username || "A").charAt(0).toUpperCase()}
                        </div>
                        <BlockStack gap="0">
                            <Text variant="bodySm" fontWeight="semibold" truncate>{review.username}</Text>
                            {review.orderId && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    <Icon source={CheckIcon} tone="success" />
                                    <Text variant="bodyXs" tone="success">Verified</Text>
                                </div>
                            )}
                        </BlockStack>
                    </InlineStack>
                </IndexTable.Cell>

                {/* Date & Status Column */}
                <IndexTable.Cell>
                    <BlockStack gap="200">
                        <Text as="span" variant="bodySm" tone="subdued">{new Date(review.createdAt).toLocaleDateString()}</Text>
                        {review.approved ? (
                            <Badge tone="success" size="small">Published</Badge>
                        ) : (
                            <Badge tone="attention" size="small">Pending</Badge>
                        )}
                    </BlockStack>
                </IndexTable.Cell>

                {/* Actions Column */}
                <IndexTable.Cell>
                    <InlineStack gap="200" wrap={false}>
                        <PolarisTooltip content={review.reply ? "Edit Reply" : "Reply"}>
                            <Button icon={ChatIcon} onClick={() => openReplyModal(review)} size="slim" />
                        </PolarisTooltip>

                        {!review.approved && (
                            <PolarisTooltip content="Approve">
                                <Button icon={CheckIcon} tone="success" onClick={() => handleApprove(review.id)} size="slim" />
                            </PolarisTooltip>
                        )}

                        <PolarisTooltip content="Delete">
                            <Button icon={DeleteIcon} tone="critical" onClick={() => handleDelete(review.id)} size="slim" />
                        </PolarisTooltip>
                    </InlineStack>
                </IndexTable.Cell>
            </IndexTable.Row>
        ),
    );

    const totalForDist = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;

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
                            {/* Total Reviews Card */}
                            <Card>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{
                                        width: '48px',
                                        height: '48px',
                                        backgroundColor: '#FFEBEE',
                                        borderRadius: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <span style={{ fontSize: '24px' }}>📝</span>
                                    </div>
                                    <BlockStack gap="100">
                                        <Text as="h3" variant="bodySm" tone="subdued">Total Reviews</Text>
                                        <Text as="p" variant="heading2xl" fontWeight="bold">{stats[0].value}</Text>
                                    </BlockStack>
                                </div>
                            </Card>

                            {/* Average Rating Card */}
                            <Card>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{
                                        width: '48px',
                                        height: '48px',
                                        backgroundColor: '#FFEBEE',
                                        borderRadius: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <span style={{ fontSize: '24px', color: '#D32F2F' }}>★</span>
                                    </div>
                                    <BlockStack gap="100">
                                        <Text as="h3" variant="bodySm" tone="subdued">Average Rating</Text>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                            <Text as="span" variant="heading2xl" fontWeight="bold" style={{ color: '#D32F2F' }}>{stats[1].value}</Text>
                                            <Text as="span" variant="bodySm" tone="subdued">/5</Text>
                                        </div>
                                    </BlockStack>
                                </div>
                            </Card>

                            {/* Pending Reviews Card */}
                            <Card>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{
                                        width: '48px',
                                        height: '48px',
                                        backgroundColor: '#FFEBEE',
                                        borderRadius: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <span style={{ fontSize: '24px' }}>⏳</span>
                                    </div>
                                    <BlockStack gap="100">
                                        <Text as="h3" variant="bodySm" tone="subdued">Pending Reviews</Text>
                                        <Text as="p" variant="heading2xl" fontWeight="bold">{stats[2].value}</Text>
                                    </BlockStack>
                                </div>
                            </Card>

                            {/* Response Rate Card */}
                            <Card>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ position: "relative", width: "56px", height: "56px" }}>
                                        <svg width="56" height="56" viewBox="0 0 56 56">
                                            <circle cx="28" cy="28" r="24" stroke="#FFEBEE" strokeWidth="5" fill="none" />
                                            <circle cx="28" cy="28" r="24" stroke="#D32F2F" strokeWidth="5" fill="none"
                                                strokeDasharray={2 * Math.PI * 24}
                                                strokeDashoffset={(2 * Math.PI * 24) - (responseRate / 100) * (2 * Math.PI * 24)}
                                                strokeLinecap="round"
                                                transform="rotate(-90 28 28)"
                                            />
                                            <text x="50%" y="54%" textAnchor="middle" fontSize="11" fill="#D32F2F" fontWeight="bold">{responseRate}%</text>
                                        </svg>
                                    </div>
                                    <BlockStack gap="100">
                                        <Text as="h3" variant="bodySm" tone="subdued">Response Rate</Text>
                                        <Text as="p" variant="bodySm" tone="subdued">Target: 80%</Text>
                                    </BlockStack>
                                </div>
                            </Card>
                        </InlineGrid>
                    </Layout.Section>
                </Layout>

                {/* 2. Charts (Reviews Growth + Distribution) */}
                <Layout>
                    <Layout.Section variant="twoThirds">
                        <Card>
                            <BlockStack gap="400">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text as="h2" variant="headingMd" fontWeight="bold">Reviews Growth (30 Days)</Text>
                                    <span style={{
                                        backgroundColor: '#FFEBEE',
                                        color: '#D32F2F',
                                        padding: '4px 12px',
                                        borderRadius: '16px',
                                        fontSize: '12px',
                                        fontWeight: '600'
                                    }}>📈 Trend</span>
                                </div>
                                <div style={{ height: "300px", width: "100%" }}>
                                    {mounted ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={reviewsOverTime}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#FFEBEE" />
                                                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#666' }} minTickGap={30} />
                                                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#666' }} allowDecimals={false} />
                                                <Tooltip
                                                    contentStyle={{
                                                        borderRadius: '8px',
                                                        border: '1px solid #FFCDD2',
                                                        boxShadow: '0 4px 12px rgba(211, 47, 47, 0.15)',
                                                        backgroundColor: '#fff'
                                                    }}
                                                    cursor={{ stroke: '#FFCDD2', strokeWidth: 1 }}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="count"
                                                    stroke="#D32F2F"
                                                    strokeWidth={3}
                                                    dot={{ r: 5, fill: '#fff', stroke: '#D32F2F', strokeWidth: 2 }}
                                                    activeDot={{ r: 7, fill: '#D32F2F', stroke: '#fff', strokeWidth: 2 }}
                                                />
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
                                    <Text as="h2" variant="headingMd" fontWeight="bold">Rating Distribution</Text>
                                    <BlockStack gap="300">
                                        {[5, 4, 3, 2, 1].map(stars => {
                                            const count = distribution[stars];
                                            const percent = (count / totalForDist) * 100;
                                            return (
                                                <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ display: 'flex', gap: '2px', minWidth: '90px' }}>
                                                        {[1, 2, 3, 4, 5].map(i => (
                                                            <span key={i} style={{
                                                                color: i <= stars ? '#D32F2F' : '#E0E0E0',
                                                                fontSize: '14px'
                                                            }}>★</span>
                                                        ))}
                                                    </div>
                                                    <div style={{
                                                        flex: 1,
                                                        height: '10px',
                                                        backgroundColor: '#FFEBEE',
                                                        borderRadius: '5px',
                                                        overflow: 'hidden'
                                                    }}>
                                                        <div style={{
                                                            width: `${percent}%`,
                                                            height: '100%',
                                                            background: 'linear-gradient(90deg, #EF5350, #D32F2F)',
                                                            borderRadius: '5px',
                                                            transition: 'width 0.3s ease'
                                                        }} />
                                                    </div>
                                                    <Text tone="subdued" variant="bodySm" style={{ minWidth: '30px', textAlign: 'right' }}>{count}</Text>
                                                </div>
                                            );
                                        })}
                                    </BlockStack>
                                </BlockStack>
                            </Card>

                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h2" variant="headingMd" fontWeight="bold">Top Reviewed Products</Text>
                                    <BlockStack gap="300">
                                        {topProducts.length > 0 ? (
                                            topProducts.map((prod, idx) => (
                                                <div key={idx} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '8px 12px',
                                                    backgroundColor: idx === 0 ? '#FFEBEE' : 'transparent',
                                                    borderRadius: '8px',
                                                    border: '1px solid #FFCDD2'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            width: '24px',
                                                            height: '24px',
                                                            backgroundColor: idx === 0 ? '#D32F2F' : '#FFCDD2',
                                                            color: idx === 0 ? '#fff' : '#B71C1C',
                                                            borderRadius: '50%',
                                                            fontSize: '12px',
                                                            fontWeight: 'bold'
                                                        }}>{idx + 1}</span>
                                                        <Text variant="bodyMd" fontWeight="semibold" truncate>
                                                            {prod.title}
                                                        </Text>
                                                    </div>
                                                    <span style={{
                                                        backgroundColor: '#D32F2F',
                                                        color: '#fff',
                                                        padding: '4px 10px',
                                                        borderRadius: '12px',
                                                        fontSize: '12px',
                                                        fontWeight: '600'
                                                    }}>{prod.count} reviews</span>
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
                                                                <InlineStack gap="200" blockAlign="center">
                                                                    <Text as="span" variant="bodyMd" fontWeight="bold">{(review.rating || 0)} ★</Text>
                                                                    {review.photos && review.photos.length > 0 && (
                                                                        <PolarisTooltip content={`${review.photos.length} photo${review.photos.length > 1 ? 's' : ''}`}>
                                                                            <Badge tone="info" size="small">
                                                                                <InlineStack gap="100" blockAlign="center">
                                                                                    <Icon source={ImageIcon} />
                                                                                    <span>{review.photos.length}</span>
                                                                                </InlineStack>
                                                                            </Badge>
                                                                        </PolarisTooltip>
                                                                    )}
                                                                </InlineStack>
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
